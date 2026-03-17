import os

from django.contrib.auth.models import User
from django.db import OperationalError, ProgrammingError, models
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone
from supabase import AuthApiError

from supabase_cliente import (
    create_supabase_admin_auth_client,
    create_supabase_auth_client,
)


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    avatar = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.user.username


@receiver(post_save, sender=User)
def create_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_profile(sender, instance, **kwargs):
    instance.profile.save()


@receiver(post_save, sender=User)
def sync_supabase_auth_user(sender, instance, created, **kwargs):
    # Si el usuario se crea desde el admin o por script, replicarlo en Supabase Auth.
    if not created:
        return

    email = (instance.email or "").strip().lower()
    if not email:
        return

    try:
        admin_client = create_supabase_admin_auth_client()
    except RuntimeError:
        return

    created_in_supabase = False
    try:
        admin_client.auth.admin.create_user(
            {
                "email": email,
                "email_confirm": True,
                "password": "Temp-Reset-Required-123!",
                "user_metadata": {
                    "username": instance.username,
                    "django_user_id": instance.id,
                    "is_superuser": bool(instance.is_superuser),
                },
            }
        )
        created_in_supabase = True
    except AuthApiError as exc:
        if exc.code not in {"email_exists", "user_already_exists", "conflict"}:
            return

    if not created_in_supabase:
        return

    try:
        anon_client = create_supabase_auth_client()
        redirect_url = os.getenv(
            "SUPABASE_RESET_REDIRECT_URL",
            "",
        )
        if not redirect_url:
            base = os.getenv("DJANGO_SITE_URL", "http://localhost:8000").rstrip("/")
            redirect_url = f"{base}/password-reset/confirm/"
        anon_client.auth.reset_password_for_email(
            email,
            options={"redirect_to": redirect_url},
        )
    except Exception:
        # No romper creaci?n local si el email falla.
        pass


class Usuario(models.Model):
    id_usuario = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=255)
    email = models.EmailField(max_length=255, unique=True)
    fecha_registro = models.DateField()
    es_superusuario = models.BooleanField(default=False)
    rol = models.CharField(max_length=20, default="jugador")
    desarrollador = models.BooleanField(default=False)

    class Meta:
        db_table = "usuario"
        managed = False

    def __str__(self):
        return f"{self.id_usuario} - {self.nombre}"


class Juego(models.Model):
    id_juego = models.AutoField(primary_key=True)
    titulo = models.CharField(max_length=255)
    genero = models.CharField(max_length=255)
    desarrollador = models.CharField(max_length=255)
    fecha_lanzamiento = models.DateField()

    slug = models.CharField(max_length=150, unique=True, blank=True, null=True)
    storage_folder = models.CharField(max_length=255, blank=True, null=True)
    entry_file = models.CharField(max_length=255, blank=True, null=True)
    public_url = models.TextField(blank=True, null=True)
    portada_url = models.TextField(blank=True, null=True)
    descripcion = models.TextField(blank=True, null=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "juego"
        managed = False

    def __str__(self):
        return f"{self.id_juego} - {self.titulo}"
class Partida(models.Model):
    id_partida = models.AutoField(primary_key=True)
    id_usuario = models.ForeignKey(
        Usuario,
        models.DO_NOTHING,
        db_column="id_usuario",
        related_name="partidas",
    )
    id_juego = models.ForeignKey(
        Juego,
        models.DO_NOTHING,
        db_column="id_juego",
        related_name="partidas",
    )
    tiempo_juego = models.IntegerField()
    score = models.IntegerField()
    fecha_partida = models.DateField()

    class Meta:
        db_table = "partida"
        managed = False

    def __str__(self):
        return f"Partida {self.id_partida} - Score: {self.score}"


@receiver(post_save, sender=User)
def sync_usuario_from_auth_user(sender, instance, created, **kwargs):
    try:
        Usuario.objects.update_or_create(
            id_usuario=instance.id,
            defaults={
                "nombre": instance.username,
                "email": instance.email,
                "fecha_registro": instance.date_joined.date(),
                "es_superusuario": instance.is_superuser,
            },
        )
    except (ProgrammingError, OperationalError):
        # In test databases (or early bootstrap), unmanaged tables may not exist.
        pass


@receiver(post_delete, sender=User)
def delete_usuario_from_auth_user(sender, instance, **kwargs):
    try:
        Usuario.objects.filter(id_usuario=instance.id).delete()
    except (ProgrammingError, OperationalError):
        pass


class FriendRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_DECLINED = "declined"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pendiente"),
        (STATUS_ACCEPTED, "Aceptada"),
        (STATUS_DECLINED, "Rechazada"),
    ]

    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friend_requests_sent")
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friend_requests_received")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["from_user", "to_user"], name="unique_friend_request"),
        ]


class Friendship(models.Model):
    user1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friendships_as_user1")
    user2 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friendships_as_user2")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user1", "user2"], name="unique_friendship"),
        ]

    @staticmethod
    def normalize_pair(a: User, b: User):
        return (a, b) if a.id < b.id else (b, a)

    @staticmethod
    def are_friends(a: User, b: User) -> bool:
        u1, u2 = Friendship.normalize_pair(a, b)
        return Friendship.objects.filter(user1=u1, user2=u2).exists()


class DirectMessage(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="dm_sent")
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name="dm_received")
    body = models.TextField(max_length=2000)
    created_at = models.DateTimeField(default=timezone.now)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]


#Notificaciones

class Notification(models.Model):
    TYPE_FRIEND_REQUEST = "friend_request"
    TYPE_FRIEND_ACCEPTED = "friend_accepted"
    TYPE_MESSAGE = "message"
    TYPE_SUPPORT = "support"

    TYPE_CHOICES = [
        (TYPE_FRIEND_REQUEST, "Solicitud de amistad"),
        (TYPE_FRIEND_ACCEPTED, "Solicitud aceptada"),
        (TYPE_MESSAGE, "Mensaje"),
        (TYPE_SUPPORT, "Soporte"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=255)
    text = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} - {self.title}"
