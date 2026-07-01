"""EventBus implementations: a no-op default and an in-memory recorder for tests."""
from application.ports.gateways import EventBus


class NoOpEventBus(EventBus):
    """Default — events are accepted and dropped. Dispatch is a later phase."""

    def publish(self, event) -> None:
        return None


class InMemoryEventBus(EventBus):
    """Records published events; handy for assertions in tests."""

    def __init__(self):
        self.events = []

    def publish(self, event) -> None:
        self.events.append(event)
