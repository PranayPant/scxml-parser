# SCXML Authoring Issues

Problems found while testing `argon_supply.scxml`. Each problem describes what goes wrong, why, and how to fix it in the SCXML.

---

## Problem 1: Empty event attribute (`event=""`)

An SCXML completion transition omits the event value:

```xml
<transition event="" target="stop_pump"/>
```

An empty event name is not valid — the generator cannot produce a C# identifier for it and the plugin fails to compile.

**Fix:** Remove the `event` attribute entirely for completion transitions (a transition with no `event` attribute is an unconditional/completion transition in SCXML):

```xml
<transition target="stop_pump"/>
```

---

## Problem 2: Event name that is a C# reserved keyword (`event="event"`)

An SCXML event is named using a word that is reserved in C#:

```xml
<transition event="event" target="some_state"/>
```

The generator uses the event name directly as a C# identifier. Reserved words like `event`, `class`, `return` etc. are illegal as identifiers and cause compilation errors. The compiler error often appears on a different line than the offending event (CS1513 on the States enum line even though the problem is in the Events enum).

**Fix:** Rename the event to something that is not a C# keyword:

```xml
<transition event="trigger" target="some_state"/>
```

---

## Problem 3: Event name that starts with a digit (`event="1"`)

An SCXML event name begins with a number:

```xml
<transition event="1" target="some_state"/>
```

C# identifiers cannot begin with a digit, so the generated code fails to compile.

**Fix:** Prefix the event name with a letter or underscore:

```xml
<transition event="phase_1" target="some_state"/>
```

---

## Problem 4: `initial` attribute points to a non-existent child state

A composite state's `initial` attribute references a child state id that does not exist — usually a typo:

```xml
<state id="fully_connected" initial="syste_ready">
  <state id="system_ready">  <!-- actual id — note the missing 'm' above -->
```

The plugin compiles but contains a reference to a state that is not in the `States` enum, causing a compilation error.

**Fix:** Correct the typo so the `initial` value matches an actual child state id exactly:

```xml
<state id="fully_connected" initial="system_ready">
```

---

## Problem 5: Variables used in `<assign>` but not declared in `<datamodel>`

`<onentry>` or `<onexit>` actions assign to variables that have no `<data>` declaration:

```xml
<onentry>
  <assign location="light" expr="0xFFFFFF"/>
</onentry>
```

If `light` is not in the `<datamodel>`, the generator does not know about it and the generated code references an undefined name.

**Fix:** Add every assigned variable to the `<datamodel>` with an initial value:

```xml
<datamodel>
  <data expr="0" id="light"/>
  <data expr="0" id="pumping"/>
  <data expr="0" id="safe_valve"/>
  <data expr="0" id="pump_rpm"/>
</datamodel>
```

Also add the corresponding entries to the system's `IO.conf` so the fields exist in the data vector at runtime:

```
Math;light;0
Math;pumping;0
Math;safe_valve;0
Math;pump_rpm;0
```

---

## Problem 6: Wildcard `*` in `<assign location>`

An `<assign>` action uses a wildcard pattern:

```xml
<assign location="oven*" expr="0"/>
```

The `*` is not a valid character in a C# variable name. The generator does not support wildcard locations, so the plugin fails to compile.

**Fix:** Replace the wildcard with explicit individual assignments for each affected field:

```xml
<onentry>
  <assign location="oven_heater1" expr="0"/>
  <assign location="oven_heater2" expr="0"/>
</onentry>
```

---

## Problem 7: Two event names that collapse to the same readable string

The generator converts event names to human-readable strings by replacing all non-alphanumeric characters with spaces and collapsing consecutive spaces. Two events that differ only in their operator or punctuation can collapse to the same string:

```
deltaP_gas_filter <= 0.3  →  "deltaP gas filter 0 3"
deltaP_gas_filter > 0.3   →  "deltaP gas filter 0 3"   ← same!
```

The plugin constructor tries to register both as entries in an event lookup table. Adding a duplicate key throws an exception at runtime, which the system reports as:

```
Unexpected error applying program changes: Exception has been thrown by the target of an invocation
```

**Fix:** Use semantic names that remain distinct after cleanup:

```xml
<transition event="deltaP_gas_filter_ok"      target="fully_connected"/>
<transition event="deltaP_gas_filter_blocked" target="gas_filter_blocked"/>
```

**How to spot potential collisions:** Two events collide if, after replacing every non-alphanumeric character with a space and collapsing repeated spaces, they produce the same string. Common patterns:

- Events that differ only in comparison operator: `foo <= N` vs `foo > N`
- Events that differ only in punctuation: `cmd: foo` vs `cmd_foo` (both → `"cmd foo"`)

---

## Summary

| # | Problem | Where to fix |
|---|---------|--------------|
| 1 | Empty `event=""` attribute | Remove the `event` attribute |
| 2 | Event name is a C# keyword | Rename the event |
| 3 | Event name starts with a digit | Prefix with a letter |
| 4 | `initial` attribute has a typo | Correct the state id |
| 5 | Variable assigned but not declared | Add to `<datamodel>` and `IO.conf` |
| 6 | Wildcard `*` in assign location | Replace with explicit field names |
| 7 | Two events collapse to the same readable string | Rename to semantic names |
