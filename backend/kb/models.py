"""SQLAlchemy-Modelle. Wertelisten sind CHECK-Constraints statt PostgreSQL-Enums — die
lassen sich in einer späteren Migration ohne `ALTER TYPE` erweitern."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, Computed, DateTime, ForeignKey, Index, Integer,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

ROLES = ("admin", "editor", "reader")
SPACE_ACCESS = ("none", "read", "edit")
MEMBER_LEVELS = ("read", "edit", "manage")
SPACE_COLORS = ("teal", "indigo", "violet", "rose", "orange", "amber", "green", "slate")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    pass


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="ck_users_role"),)

    id: Mapped[uuid.UUID] = _pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text)
    oidc_subject: Mapped[str | None] = mapped_column(String(255), unique=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="reader")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    avatar_color: Mapped[str] = mapped_column(String(16), nullable=False, default="teal")
    created_at: Mapped[datetime] = _now()
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Session_(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # SHA-256 des Tokens
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    csrf_token: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = _now()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_agent: Mapped[str] = mapped_column(String(255), nullable=False, default="")


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    __table_args__ = (Index("ix_login_attempts_at", "at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    ip: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    at: Mapped[datetime] = _now()


class Space(Base):
    __tablename__ = "spaces"
    __table_args__ = (
        CheckConstraint(_in("default_access", SPACE_ACCESS), name="ck_spaces_default_access"),
        CheckConstraint(_in("color", SPACE_COLORS), name="ck_spaces_color"),
    )

    id: Mapped[uuid.UUID] = _pk()
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    icon: Mapped[str] = mapped_column(String(16), nullable=False, default="📘")
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="teal")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    default_access: Mapped[str] = mapped_column(String(8), nullable=False, default="read")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _now()
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id])


class SpaceMember(Base):
    __tablename__ = "space_members"
    __table_args__ = (CheckConstraint(_in("level", MEMBER_LEVELS), name="ck_space_members_level"),)

    space_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    level: Mapped[str] = mapped_column(String(8), nullable=False)

    user: Mapped[User] = relationship()


_SEARCH_EXPR = (
    "setweight(to_tsvector('german'::regconfig, coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('german'::regconfig, coalesce(tags_text, '')), 'B') || "
    "setweight(to_tsvector('german'::regconfig, coalesce(content_md, '')), 'C')"
)


class Page(Base):
    __tablename__ = "pages"
    __table_args__ = (
        Index("ix_pages_search", "search_vector", postgresql_using="gin"),
        Index("ix_pages_space_parent", "space_id", "parent_id", "position"),
    )

    id: Mapped[uuid.UUID] = _pk()
    space_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pages.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    icon: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    content_md: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tags_text: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    search_vector = mapped_column(TSVECTOR, Computed(_SEARCH_EXPR, persisted=True))

    space: Mapped[Space] = relationship()
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id])
    updated_by: Mapped[User | None] = relationship(foreign_keys=[updated_by_id])


class PageRevision(Base):
    __tablename__ = "page_revisions"
    __table_args__ = (UniqueConstraint("page_id", "version", name="uq_page_revisions_version"),)

    id: Mapped[uuid.UUID] = _pk()
    page_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content_md: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _now()

    author: Mapped[User | None] = relationship()


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("space_id", "name", name="uq_tags_space_name"),)

    id: Mapped[uuid.UUID] = _pk()
    space_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(32), nullable=False)


class PageTag(Base):
    __tablename__ = "page_tags"

    page_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True)


class Favorite(Base):
    __tablename__ = "favorites"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    page_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = _now()


class PageView(Base):
    __tablename__ = "page_views"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    page_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"), primary_key=True)
    viewed_at: Mapped[datetime] = _now()


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = _pk()
    space_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(16), nullable=False, default="📄")
    content_md: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _now()


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = _pk()
    page_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"), nullable=False, index=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _now()


__all__ = [
    "Base", "User", "Session_", "LoginAttempt", "Space", "SpaceMember", "Page", "PageRevision",
    "Tag", "PageTag", "Favorite", "PageView", "Template", "Attachment",
    "ROLES", "SPACE_ACCESS", "MEMBER_LEVELS", "SPACE_COLORS",
]
