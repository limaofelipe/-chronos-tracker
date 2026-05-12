# Data Invariants
1. A UserProfile can only be accessed or modified by its owner (userId == request.auth.uid).
2. A WorkEntry belongs to a specific user (userId). The user can only create/update/delete entries where `entry.userId == request.auth.uid` inside their own `users/{userId}/entries` collection.
3. Mandatory field types and sizes for all UserProfile and WorkEntry fields.
4. `userId` in WorkEntry cannot be updated once created.

# The "Dirty Dozen" Payloads
1. Create WorkEntry without authentication.
2. Create WorkEntry in another user's subcollection.
3. Create WorkEntry with mismatched `userId` field.
4. Update WorkEntry changing its `userId`.
5. Create WorkEntry with missing `durationMs`.
6. Create WorkEntry with an extra "isVerified" field.
7. Update WorkEntry adding an extra "isAdmin" field.
8. Read another user's list of WorkEntries.
9. Create UserProfile with non-number `hourlyRate`.
10. Update UserProfile with extra field `role`.
11. Create WorkEntry with massive string payload (resource poisoning).
12. Attempt to bypass list query using blanket `isSignedIn()` without correct relational match.

# Test Runner
*(Conceptual integration for the 'Dirty Dozen' testrunner will be covered in project files)*
