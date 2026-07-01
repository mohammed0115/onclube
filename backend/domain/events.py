"""
Domain events — value objects describing something that happened.

In this phase events are emitted through an EventBus port (see
application.ports.gateways.EventBus) whose default implementation is a no-op.
This establishes the seam so later phases can dispatch to async handlers
(emails, webhooks, analytics) without touching use-case code.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass(frozen=True)
class DomainEvent:
    pass


@dataclass(frozen=True)
class PaymentApproved(DomainEvent):
    proof_id: str
    subscription_id: str
    student_id: str


@dataclass(frozen=True)
class PaymentRejected(DomainEvent):
    proof_id: str
    student_id: str


@dataclass(frozen=True)
class BookingCreated(DomainEvent):
    booking_id: str
    student_id: str
    slot_id: str


@dataclass(frozen=True)
class BookingCancelled(DomainEvent):
    booking_id: str
    student_id: str
    credit_refunded: bool


@dataclass(frozen=True)
class SessionStarted(DomainEvent):
    session_id: str
    booking_id: str
    started_at: Optional[datetime]


@dataclass(frozen=True)
class SessionCompleted(DomainEvent):
    session_id: str
    booking_id: str
    ended_at: Optional[datetime]


@dataclass(frozen=True)
class AIReportGenerated(DomainEvent):
    report_id: str
    session_id: str


@dataclass(frozen=True)
class StudentRegistered(DomainEvent):
    user_id: str
    student_id: str


@dataclass(frozen=True)
class PaymentProofSubmitted(DomainEvent):
    proof_id: str
    student_id: str
    transaction_number: str


@dataclass(frozen=True)
class TopicPublished(DomainEvent):
    topic_id: str
    instructor_id: str
