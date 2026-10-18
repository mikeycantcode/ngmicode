# Pen-test findings: driver API

An external pen-test of the driver-facing API came back with two **high**-severity findings.
Fix them before the report goes to the board on Friday.

> **H-1: Driver impersonation.** Using a valid driver token (driver *B*), the tester sent
> `POST /drivers/me/location` with a `driverId` of another driver (*A*) in the body. The
> request succeeded and moved driver A on the map. The tester then completed driver A's
> in-progress trip with `POST /trips/:id/complete` and an inflated `distanceMeters`.
>
> **H-2: Coordinate coercion.** `POST /drivers/me/location` with `{"lat": null, "lng": null}`
> returns 200 and places the driver at (0, 0), "Null Island". Riders there were then
> dispatched a driver that doesn't exist on the street. String coordinates are also accepted.

## Requirements

- A **driver** principal can only act as itself. If a request body names a different
  `driverId`, the request fails with **403**. Nothing changes.
- **Ops tooling must keep working.** An **admin** principal may still act on behalf of a driver
  by passing `driverId` in the body (FLEET-77).
- Location coordinates must be finite JSON **numbers** in range. Anything else gets **400**
  `validation_error`, and the driver's stored location is unchanged. We've dropped support for
  the old Android builds that sent strings.
- Fix the vulnerability **class**, not just the two URLs in the report.
- Keep error responses in the existing format.
