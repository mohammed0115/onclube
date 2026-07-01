"""
Application layer — use cases, orchestration, transactions, permission boundary.

Depends on the domain layer and on ports (interfaces). Concrete infrastructure
(ORM repositories, gateways) is injected, so use cases never import Django views
or serializers and the presentation layer never contains business logic.
"""
