from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0003_alter_directmessage_options_notification"),
    ]

    operations = [
        migrations.AlterField(
            model_name="profile",
            name="avatar",
            field=models.URLField(blank=True, null=True),
        ),
    ]
