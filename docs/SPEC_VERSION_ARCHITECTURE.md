# MCP Spec Version Compatibility Architecture

## Default Behavior: MCP 2025-03-26 Mode

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MCP Open Discovery v2.0                         │
│                    (Default: 2025-03-26 Mode)                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│   ServiceNow    │
│   or Legacy     │
│    Client       │
└────────┬────────┘
         │
         ├─ Option 1: Stateless Request
         │   POST /mcp (no session header)
         │   ↓
         │   [Temporary Transport]
         │   ↓
         │   Response (no session ID)
         │
         ├─ Option 2: Session-Based Request
         │   POST /mcp (no session header, method=initialize)
         │   ↓
         │   [Create Session] → sessionId: "uuid"
         │   ↓
         │   Response + MCP-Session-Id header
         │
         └─ Option 3: Reuse Session
             POST /mcp + MCP-Session-Id header
             ↓
             [Find existing transport]
             ↓
             Response

┌──────────────────────────────────┐
│    HTTP Transport Config         │
├──────────────────────────────────┤
│ SESSION_TTL_MS = -1 (default)    │ ← TTL disabled
│                                  │   (sessions persist forever)
│ Cleanup: SKIPPED                 │ ← No periodic cleanup
│                                  │   (sessions never expire)
│ Session Lifecycle:               │
│  • Initialize → Session created  │
│  • Request → Activity updated    │
│  • DELETE → Session deleted      │
│  • (No auto-expiration)          │
└──────────────────────────────────┘
```

## Optional Mode: MCP 2025-11-25 with TTL

```
┌──────────────────────────────────────────────────────────────┐
│    MCP Open Discovery v2.0 (Optional: 2025-11-25 Mode)       │
│    Set: MCP_SESSION_TTL_MS=600000 (10 minutes)               │
└──────────────────────────────────────────────────────────────┘

┌─────────────────┐
│   Modern or     │
│ Resumable       │
│    Client       │
└────────┬────────┘
         │
         ├─ Initialize
         │  POST /mcp (no session header)
         │  ↓
         │  [Create Session] → sessionId: "uuid"
         │  createdAt: 2024-01-01 10:00:00
         │  lastActivity: 2024-01-01 10:00:00 (now)
         │  ↓
         │  Response + MCP-Session-Id header
         │
         ├─ Send Requests (within TTL window)
         │  POST /mcp + MCP-Session-Id header
         │  ↓
         │  [Find existing transport]
         │  lastActivity: 2024-01-01 10:05:00 (updated)
         │  ↓
         │  Response
         │
         ├─ Open SSE Stream
         │  GET /mcp + MCP-Session-Id header
         │  ↓
         │  [SSE connection established]
         │  Server sends events...
         │
         ├─ SSE Stream Disconnects
         │  (Network glitch, client restart, etc.)
         │  ↓
         │  Session still active (within TTL)
         │  Events queued/buffered
         │
         ├─ Client Reconnects (within TTL window)
         │  GET /mcp + MCP-Session-Id header
         │        + Last-Event-ID: "42"
         │  ↓
         │  [Resume SSE stream]
         │  Send buffered events since event 42
         │  ↓
         │  Continue as normal
         │
         └─ TTL Expiration (600+ sec of inactivity)
            Next request attempts:
            POST /mcp + MCP-Session-Id header
            ↓
            [Session not found in map]
            ↓
            Response: 404 Session not found
            Client must re-initialize

┌──────────────────────────────────────┐
│    HTTP Transport Config             │
├──────────────────────────────────────┤
│ SESSION_TTL_MS = 600000 (10 min)    │ ← TTL enabled
│                                      │   (auto-expire after N ms)
│ Cleanup: ACTIVE                      │ ← Every 60 sec:
│                                      │   Check lastActivity
│                                      │   Remove if expired
│                                      │
│ Session Lifecycle:                   │
│  • Initialize → Session created      │
│  • Request → lastActivity updated    │
│  • Inactivity → Session expires      │
│  • DELETE → Session deleted          │
│  • Reconnect → Reuse if not expired  │
│  • Expired → 404, must re-init       │
└──────────────────────────────────────┘
```

## Configuration Impact

```
┌─────────────────────────────────────────────────────────────┐
│              Configuration Switch                            │
└─────────────────────────────────────────────────────────────┘

Environment Variable: MCP_SESSION_TTL_MS

┌─────────────────────┬──────────────────────────────────────┐
│ Value               │ Behavior                             │
├─────────────────────┼──────────────────────────────────────┤
│ -1 (default)        │ 2025-03-26 Mode                     │
│ (or unset)          │ • Sessions persist forever          │
│                     │ • No automatic cleanup              │
│                     │ • ServiceNow compatible             │
│                     │ • Stateless requests work           │
├─────────────────────┼──────────────────────────────────────┤
│ 300000              │ 5-minute TTL                         │
│ (5 minutes)         │ • Aggressive cleanup                │
│                     │ • Quick session expiration          │
│                     │ • Low memory footprint              │
├─────────────────────┼──────────────────────────────────────┤
│ 600000              │ 10-minute TTL (2025-11-25 standard) │
│ (10 minutes)        │ • Standard session window           │
│                     │ • SSE resumability via Last-Event-ID
│                     │ • Good balance                      │
│                     │ • Requires client re-init on 404    │
├─────────────────────┼──────────────────────────────────────┤
│ 1800000             │ 30-minute TTL                        │
│ (30 minutes)        │ • Generous window                   │
│                     │ • Best for mixed environments       │
│                     │ • Good for slow/flaky networks      │
│                     │ • Legacy clients mostly unaffected  │
├─────────────────────┼──────────────────────────────────────┤
│ 3600000             │ 1-hour TTL                           │
│ (1 hour)            │ • Very generous                      │
│                     │ • Minimal session cleanup           │
│                     │ • Use only if you know your clients │
└─────────────────────┴──────────────────────────────────────┘
```

## Client Compatibility Matrix

```
┌──────────────────────────────────────────────────────────────┐
│            Client × Configuration Compatibility              │
└──────────────────────────────────────────────────────────────┘

                      MCP_SESSION_TTL_MS
Client Type          -1 (default)    600000 (10 min)    1800000
                     [2025-03-26]    [2025-11-25]       [30 min]
─────────────────────────────────────────────────────────────────
ServiceNow
Stateless Requests    ✅ Works         ✅ Works           ✅ Works
                      (unlimited)     (10 min window)    (30 min)

ServiceNow
Session-Based         ✅ Works         ✅ Works           ✅ Works
                      (forever)       (10 min TTL)       (30 min TTL)

Legacy MCP 2025-03-26 ✅ Works         ✅ Works           ✅ Works
Clients               (designed)      (compatible)       (compatible)

Modern 2025-11-25     ✅ Works         ✅ Works (best)    ✅ Works
Clients               (no resumption) (with resumption)  (long window)

VS Code MCP Ext.      ✅ Works         ✅ Works (best)    ✅ Works

Long-Running          ✅ Works         ⚠️ Must refresh    ✅ Better
Integrations          (forever)       (every 10 min)     (every 30 min)

Batch Processing      ✅ Works         ✅ Works           ✅ Works
(one-off requests)
```

## Session Lifecycle Comparison

```
┌────────────────────────────────────────────────────────────┐
│             Session Lifecycle Timeline                     │
└────────────────────────────────────────────────────────────┘

SCENARIO A: MCP 2025-03-26 Mode (TTL = -1)
──────────────────────────────────────────

Time    Event                           State
────    ─────────                       ─────
T0      Initialize                      Session created
        MCP-Session-Id: "uuid-123"

T1      Request (5 min later)           Session active
        MCP-Session-Id: "uuid-123"      (no change to TTL)

T2      Request (1 hour later)          Session active
        MCP-Session-Id: "uuid-123"      (still no change)

T3      Request (1 day later)           Session active
        MCP-Session-Id: "uuid-123"      (still active!)

T4      DELETE /mcp                     Session deleted
        MCP-Session-Id: "uuid-123"      (explicit cleanup)

T5      Next request after DELETE       404 Not Found
        MCP-Session-Id: "uuid-123"      Must re-initialize


SCENARIO B: MCP 2025-11-25 Mode (TTL = 600000 = 10 min)
───────────────────────────────────────────────────────

Time    Event                           State
────    ─────                           ─────
T0      Initialize                      Session created
        MCP-Session-Id: "uuid-456"      TTL expires at T0 + 600s

T1      Request (5 min later)           Session active
        MCP-Session-Id: "uuid-456"      TTL refreshed to T1 + 600s

T2      Inactivity (15 min total)       Session expired!
        No request sent                 Cleanup removed at T2+60s

T3      Request (15 min after init)     404 Not Found
        MCP-Session-Id: "uuid-456"      Must re-initialize

T4      SSE stream connects             Session active
        GET /mcp (no inactivity)        TTL expires at T4 + 600s
        MCP-Session-Id: "uuid-789"

T5      Server disconnects SSE          Session still active!
        (sends retry field)             TTL expires at T4 + 600s

T6      Client reconnects (5 min)       Session resumed
        GET /mcp + Last-Event-ID        Last events replayed
        MCP-Session-Id: "uuid-789"      TTL refreshed

T7      No activity (15 min later)      Session expired!
        (SSE not resumed)               Cleanup removed

T8      Client tries to reconnect       404 Not Found
        GET /mcp                        Must re-initialize
        MCP-Session-Id: "uuid-789"

T9      DELETE /mcp (explicit)          Session deleted
        MCP-Session-Id: new-id          (cleanup regardless of TTL)
```

## Decision Tree

```
┌─ START: Choose your MCP_SESSION_TTL_MS value
│
├─ Are you integrating with ServiceNow?
│  ├─ YES → Set MCP_SESSION_TTL_MS=-1 (default)
│  │        Reason: Sessions persist forever, ServiceNow compatible
│  │
│  └─ NO ├─ Are you using only modern 2025-11-25 clients?
│        ├─ YES → Set MCP_SESSION_TTL_MS=600000 (10 min)
│        │        Reason: Standard TTL, SSE resumability, efficient
│        │
│        └─ NO ├─ Do you have a mix of old and new clients?
│             ├─ YES → Set MCP_SESSION_TTL_MS=1800000 (30 min)
│             │        Reason: Both groups work well, longer window
│             │
│             └─ UNSURE → Leave MCP_SESSION_TTL_MS=-1 (default)
│                         Reason: Safest default, backward compatible
│
└─ RESULT: Configuration set, server will show mode at startup
           Check logs: "MCP Compatibility: 2025-03-26..." or "...2025-11-25..."
```

## See Also

- [Backward Compatibility Guide](./BACKWARD_COMPATIBILITY.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [HTTP Transport Architecture](./TRANSPORT_MANAGER.md)
