from datetime import date

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.entities import CaseStatus, Organization, OrganizationMember, SurgeryCase, User, UserRole


def run_seed() -> None:
    db = SessionLocal()
    try:
        existing_admin = db.scalar(select(User).where(User.email == "admin@laparoscopy.local"))
        if existing_admin is None:
            admin = User(
                full_name="System Admin",
                email="admin@laparoscopy.local",
                password_hash=get_password_hash("AdminPass123!"),
                role=UserRole.admin,
                is_active=True,
            )
            db.add(admin)
            db.flush()

            org = Organization(name="Demo Surgery Center")
            db.add(org)
            db.flush()

            db.add(OrganizationMember(organization_id=org.id, user_id=admin.id, role_in_org="owner"))
            db.add(
                SurgeryCase(
                    organization_id=org.id,
                    created_by_user_id=admin.id,
                    case_code="DEMO-CASE-001",
                    procedure_type="Laparoscopic Cholecystectomy",
                    surgery_date=date.today(),
                    notes="Seeded demonstration case.",
                    de_identification_notes="Patient identifiers removed in demo dataset.",
                    status=CaseStatus.draft,
                )
            )
            db.commit()
            print("Demo seed completed.")
        else:
            print("Demo seed already exists.")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()

