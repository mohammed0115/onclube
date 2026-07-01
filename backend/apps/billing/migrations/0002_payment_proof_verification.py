"""
PaymentProof verification-workflow fields (Phase 6C).

Hand-authored to express the renames deterministically (no interactive prompts):
  reference        -> transaction_number (unique)
  transfer_date    -> transfer_datetime  (Date -> DateTime)
plus sender_name / receiver_name / raw_ocr_data. The status enum value change
(pending -> pending_review) and its CHECK constraint are in the follow-up
auto-generated migration.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0001_initial"),
    ]

    operations = [
        migrations.RenameField(
            model_name="paymentproof",
            old_name="reference",
            new_name="transaction_number",
        ),
        migrations.RenameField(
            model_name="paymentproof",
            old_name="transfer_date",
            new_name="transfer_datetime",
        ),
        migrations.AlterField(
            model_name="paymentproof",
            name="transfer_datetime",
            field=models.DateTimeField(),
        ),
        migrations.AlterField(
            model_name="paymentproof",
            name="transaction_number",
            field=models.CharField(max_length=60, unique=True),
        ),
        migrations.AddField(
            model_name="paymentproof",
            name="sender_name",
            field=models.CharField(blank=True, max_length=150, null=True),
        ),
        migrations.AddField(
            model_name="paymentproof",
            name="receiver_name",
            field=models.CharField(blank=True, max_length=150, null=True),
        ),
        migrations.AddField(
            model_name="paymentproof",
            name="raw_ocr_data",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
