from django.contrib import admin
from django.urls import path, include
from games import views
from django.shortcuts import redirect
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include("games.urls")),
]

# Solo en DEBUG: servir media local de forma temporal/legacy.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
