from datetime import date

from django.core.management.base import BaseCommand

from games.models import Juego


class Command(BaseCommand):
    help = "Inserta juegos base en la tabla juego sin duplicar por titulo."

    def handle(self, *args, **options):
        # Catalogo base usado para alta/actualizacion idempotente.
        juegos_base = [
            {
                "titulo": "One Hit Kill",
                "genero": "Accion",
                "desarrollador": "MondogoGames",
                "fecha_lanzamiento": date(2026, 6, 1),
            },
            {
                "titulo": "Wall Blood",
                "genero": "Aventura",
                "desarrollador": "MondongoGames",
                "fecha_lanzamiento": date(2025, 9, 1),
            },
            {
                "titulo": "Regular Show: Fist Punch",
                "genero": "Arcade",
                "desarrollador": "Cartoon Network",
                "fecha_lanzamiento": date(2026, 3, 2),
            },
            {
                "titulo": "Regular Show: Battle of the Behemoths",
                "genero": "Arcade",
                "desarrollador": "Cartoon Network",
                "fecha_lanzamiento": date(2026, 3, 4),
            },
            {
                "titulo": "Sky Streaker",
                "genero": "Arcade",
                "desarrollador": "Cartoon Network",
                "fecha_lanzamiento": date(2026, 3, 3),
            },
            {
                "titulo": "Escaping the Prison",
                "genero": "Arcade",
                "desarrollador": "Puffballs United",
                "fecha_lanzamiento": date(2026, 3, 3),
            },
            {
                "titulo": "Extreme Pamplona",
                "genero": "Arcade",
                "desarrollador": "CrazyGames",
                "fecha_lanzamiento": date(2026, 3, 3),
            },
            {
                "titulo": "Agent P: Rebel Spy",
                "genero": "Arcade",
                "desarrollador": "Disney",
                "fecha_lanzamiento": date(2026, 3, 4),
            },
        ]

        creados = 0
        actualizados = 0

        for data in juegos_base:
            _, created = Juego.objects.update_or_create(
                titulo=data["titulo"],
                defaults={
                    "genero": data["genero"],
                    "desarrollador": data["desarrollador"],
                    "fecha_lanzamiento": data["fecha_lanzamiento"],
                },
            )
            if created:
                creados += 1
            else:
                actualizados += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed completado. Creados: {creados}. Actualizados: {actualizados}."
            )
        )
