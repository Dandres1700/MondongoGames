from django import forms
from django.contrib.auth.models import User
from .models import Profile

class EditProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ["username", "first_name", "last_name", "email"]

class ProfileForm(forms.ModelForm):
    avatar = forms.FileField(
        required=False,
        widget=forms.FileInput(attrs={
            "class": "custom-file",
            "accept": "image/*"
        }),
    )
    class Meta:
        model = Profile
        fields = ["avatar"]
