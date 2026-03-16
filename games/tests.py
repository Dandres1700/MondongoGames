import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.contrib.messages import get_messages
from django.test import TestCase
from django.urls import reverse

from games.models import Juego


class AuthViewsTests(TestCase):
    def test_login_with_username_success(self):
        user = User.objects.create_user(
            username="dzurita",
            email="dzurita@example.com",
            password="StrongPass123!",
        )
        response = self.client.post(
            reverse("login"),
            {"username": user.username, "password": "StrongPass123!"},
            follow=False,
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse("home"))
        self.assertEqual(str(self.client.session.get("_auth_user_id")), str(user.id))

    def test_login_with_email_success(self):
        user = User.objects.create_user(
            username="by_email",
            email="by_email@example.com",
            password="StrongPass123!",
        )
        response = self.client.post(
            reverse("login"),
            {"username": user.email, "password": "StrongPass123!"},
            follow=False,
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse("home"))
        self.assertEqual(str(self.client.session.get("_auth_user_id")), str(user.id))

    def test_login_invalid_credentials_adds_error_message(self):
        User.objects.create_user(
            username="invalid_case",
            email="invalid_case@example.com",
            password="StrongPass123!",
        )
        response = self.client.post(
            reverse("login"),
            {"username": "invalid_case", "password": "WrongPass123!"},
            follow=True,
        )
        messages = list(get_messages(response.wsgi_request))
        self.assertTrue(any("Credenciales incorrectas" in str(m) for m in messages))

    def test_register_success_creates_user_and_logs_in(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "new_user",
                "email": "new_user@example.com",
                "password1": "StrongPass123!",
                "password2": "StrongPass123!",
            },
            follow=False,
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse("home"))
        self.assertTrue(User.objects.filter(username="new_user").exists())
        new_user = User.objects.get(username="new_user")
        self.assertEqual(str(self.client.session.get("_auth_user_id")), str(new_user.id))

    def test_register_rejects_duplicate_username(self):
        User.objects.create_user(
            username="dup_user",
            email="dup_user_1@example.com",
            password="StrongPass123!",
        )
        response = self.client.post(
            reverse("register"),
            {
                "username": "dup_user",
                "email": "dup_user_2@example.com",
                "password1": "StrongPass123!",
                "password2": "StrongPass123!",
            },
            follow=True,
        )
        messages = list(get_messages(response.wsgi_request))
        self.assertTrue(any("El usuario ya existe" in str(m) for m in messages))

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(
            username="user_1",
            email="same_email@example.com",
            password="StrongPass123!",
        )
        response = self.client.post(
            reverse("register"),
            {
                "username": "user_2",
                "email": "same_email@example.com",
                "password1": "StrongPass123!",
                "password2": "StrongPass123!",
            },
            follow=True,
        )
        messages = list(get_messages(response.wsgi_request))
        self.assertTrue(any("El correo ya está registrado" in str(m) for m in messages))

    def test_register_rejects_password_mismatch(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "mismatch_user",
                "email": "mismatch_user@example.com",
                "password1": "StrongPass123!",
                "password2": "DifferentPass123!",
            },
            follow=True,
        )
        messages = list(get_messages(response.wsgi_request))
        self.assertTrue(any("Las contraseñas no coinciden" in str(m) for m in messages))


class DashboardTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="dashboard_user",
            email="dashboard_user@example.com",
            password="StrongPass123!",
        )
        self.client.login(username="dashboard_user", password="StrongPass123!")

    def _mock_juego_queryset(self):
        juegos = [
            SimpleNamespace(id_juego=1, titulo="One Hit Kill", genero="Acción"),
            SimpleNamespace(id_juego=2, titulo="Dungeon Spell", genero="Aventura"),
        ]
        qs = Mock()
        qs.order_by.return_value = juegos
        return qs

    @patch("games.views.Juego.objects.all")
    def test_dashboard_search_filter(self, mock_all):
        mock_all.return_value = self._mock_juego_queryset()
        response = self.client.get(reverse("dashboard"), {"q": "One"})
        juegos = response.context["juegos"]
        self.assertEqual(len(juegos), 1)
        self.assertEqual(juegos[0]["nombre"], "One Hit Kill")

    @patch("games.views.Juego.objects.all")
    def test_dashboard_category_a_ventura_shows_one_hit_kill(self, mock_all):
        mock_all.return_value = self._mock_juego_queryset()
        response = self.client.get(reverse("dashboard"), {"categoria": "Aventura"})
        nombres = [j["nombre"] for j in response.context["juegos"]]
        self.assertIn("One Hit Kill", nombres)
        self.assertNotIn("Dungeon Spell", nombres)

    @patch("games.views.Juego.objects.all")
    def test_dashboard_category_filter_supports_without_accent(self, mock_all):
        mock_all.return_value = self._mock_juego_queryset()
        response = self.client.get(reverse("dashboard"), {"categoria": "Accion"})
        nombres = [j["nombre"] for j in response.context["juegos"]]
        self.assertIn("Dungeon Spell", nombres)


class RegistrarPartidaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="partida_user",
            email="partida_user@example.com",
            password="StrongPass123!",
        )
        self.url = reverse("registrar_partida")
        self.client.login(username="partida_user", password="StrongPass123!")

    def test_registrar_partida_rejects_get(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 405)

    def test_registrar_partida_rejects_invalid_json(self):
        response = self.client.post(
            self.url,
            data="{invalid_json",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "JSON invalido")

    def test_registrar_partida_requires_id_juego(self):
        response = self.client.post(
            self.url,
            data=json.dumps({"score": 120, "tiempo_juego": 30}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "id_juego es requerido")

    @patch("games.views.Juego.objects.get")
    def test_registrar_partida_game_not_found(self, mock_get):
        mock_get.side_effect = Juego.DoesNotExist
        response = self.client.post(
            self.url,
            data=json.dumps({"id_juego": 999, "score": 120, "tiempo_juego": 30}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "Juego no encontrado")

    @patch("games.views.Partida.objects.create")
    @patch("games.views.Usuario.objects.get_or_create")
    @patch("games.views.Juego.objects.get")
    def test_registrar_partida_success(
        self,
        mock_juego_get,
        mock_usuario_get_or_create,
        mock_partida_create,
    ):
        mock_juego_get.return_value = SimpleNamespace(id_juego=7)
        mock_usuario_get_or_create.return_value = (SimpleNamespace(id_usuario=self.user.id), True)
        mock_partida_create.return_value = SimpleNamespace(id_partida=99)

        response = self.client.post(
            self.url,
            data=json.dumps({"id_juego": 7, "score": 350, "tiempo_juego": 45}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ok"], True)
        self.assertEqual(response.json()["id_partida"], 99)
        mock_partida_create.assert_called_once()

    @patch("games.views.Usuario.objects.get_or_create")
    @patch("games.views.Juego.objects.get")
    def test_registrar_partida_rejects_invalid_score_or_time(self, mock_juego_get, mock_usuario_get_or_create):
        mock_juego_get.return_value = SimpleNamespace(id_juego=7)
        mock_usuario_get_or_create.return_value = (SimpleNamespace(id_usuario=self.user.id), True)

        response = self.client.post(
            self.url,
            data=json.dumps({"id_juego": 7, "score": "abc", "tiempo_juego": 45}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "score/tiempo_juego invalidos")
