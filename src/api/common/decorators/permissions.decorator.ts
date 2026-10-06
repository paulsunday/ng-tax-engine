import { SetMetadata } from "@nestjs/common";
import { PermissionKey } from "../rbac.constants";

export const PERMISSIONS_KEY = "requiredPermissions";

/** Marks a route as requiring one or more permissions, enforced by PermissionsGuard. */
export const RequirePermissions = (...permissions: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, permissions);
