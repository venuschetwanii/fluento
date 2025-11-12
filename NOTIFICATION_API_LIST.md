# Notification API Endpoints

List of all API endpoints where notifications are created, with their paths and action names.

## Exam APIs

| Method   | Path                     | Action    | Notification Type |
| -------- | ------------------------ | --------- | ----------------- |
| `POST`   | `/exams`                 | `create`  | `exam`            |
| `PUT`    | `/exams/:examId`         | `update`  | `exam`            |
| `DELETE` | `/exams/:examId`         | `delete`  | `exam`            |
| `POST`   | `/exams/:examId/restore` | `restore` | `exam`            |

## Course APIs

| Method   | Path                         | Action    | Notification Type |
| -------- | ---------------------------- | --------- | ----------------- |
| `POST`   | `/courses`                   | `create`  | `course`          |
| `PUT`    | `/courses/:courseId`         | `update`  | `course`          |
| `DELETE` | `/courses/:courseId`         | `delete`  | `course`          |
| `POST`   | `/courses/:courseId/restore` | `restore` | `course`          |

## User/Admin APIs

| Method   | Path                       | Action    | Notification Type                                                       |
| -------- | -------------------------- | --------- | ----------------------------------------------------------------------- |
| `POST`   | `/users`                   | `create`  | `admin` (if role=admin) or `user` (if role=tutor)                       |
| `PUT`    | `/users/:userId`           | `update`  | `admin` (if role=admin) or `user` (if role=tutor)                       |
| `DELETE` | `/users/:userId`           | `delete`  | `admin` (if role=admin) or `user` (if role=tutor) - soft delete (block) |
| `DELETE` | `/users/:userId?hard=true` | `delete`  | `admin` (if role=admin) or `user` (if role=tutor) - hard delete         |
| `POST`   | `/users/:userId/unblock`   | `restore` | `admin` (if role=admin) or `user` (if role=tutor)                       |

## Summary

**Total: 13 API endpoints create notifications**

- **4 Exam endpoints**: create, update, delete, restore
- **4 Course endpoints**: create, update, delete, restore
- **5 User/Admin endpoints**: create, update (admin/tutor), delete soft (admin/tutor), delete hard (admin/tutor), restore/unblock (admin/tutor)

## Notes

1. **User Creation**: Creates notification for both `admin` and `tutor` roles

   - Admin users → notification type: `"admin"`
   - Tutor users → notification type: `"user"`

2. **User Update**: Creates notification for both `admin` and `tutor` roles

   - Admin users → notification type: `"admin"`
   - Tutor users → notification type: `"user"`

3. **User Delete (Soft)**: Creates notification when user is blocked (soft delete) for both `admin` and `tutor` roles

   - Admin users → notification type: `"admin"`, action: `"delete"`
   - Tutor users → notification type: `"user"`, action: `"delete"`

4. **User Delete (Hard)**: Creates notification for hard delete (`?hard=true`) of both `admin` and `tutor` users

   - Admin users → notification type: `"admin"`, action: `"delete"`
   - Tutor users → notification type: `"user"`, action: `"delete"`
   - Note: Hard delete is only allowed for admin and tutor users (not students)

5. **User Restore/Unblock**: Creates notification when user is unblocked for both `admin` and `tutor` roles
   - Admin users → notification type: `"admin"`, action: `"restore"`
   - Tutor users → notification type: `"user"`, action: `"restore"`
