# Study Room realtime

This folder owns Study Room socket authentication, room-join authorization, encrypted message events, and typing fan-out.

Socket.IO *server construction* belongs in `infrastructure/realtime`. Lecturers are not Study Room participants. The server must not decrypt chat payloads.
