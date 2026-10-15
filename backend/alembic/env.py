from alembic import context
from sqlalchemy import create_engine

from kb.models import Base

url = context.config.get_main_option("sqlalchemy.url")
engine = create_engine(url)
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()
engine.dispose()
