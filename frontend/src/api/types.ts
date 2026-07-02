// TypeScript mirror of the backend Pydantic schemas.

export type Role = "admin" | "member";

export type Permission =
  | "report:create"
  | "report:view"
  | "report:edit"
  | "report:delete"
  | "slide:upload"
  | "slide:view"
  | "slide:update"
  | "slide:delete"
  | "slide:share";

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string;
  picture?: string | null;
  role: Role;
  permissions: Permission[];
  status: string;
  is_active: boolean;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Me {
  user: User;
  organization: Organization;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  needs_onboarding: boolean;
  user: User | null;
}

export interface AuthConfig {
  google_client_id: string | null;
  google_enabled: boolean;
  dev_login_enabled: boolean;
}

export interface Slide {
  id: string;
  report_id: string;
  original_filename: string;
  size_bytes: number;
  status: "uploading" | "processing" | "ready" | "error";
  error?: string | null;
  width?: number | null;
  height?: number | null;
  level_count?: number | null;
  mpp_x?: number | null;
  mpp_y?: number | null;
  vendor?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  title: string;
  description: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  slide_count: number;
}

export interface ReportDetail extends Report {
  slides: Slide[];
}

export interface Share {
  id: string;
  slide_id: string;
  token: string;
  created_at: string;
  expires_at?: string | null;
  revoked: boolean;
}

export interface SharedSlide {
  slide_id: string;
  original_filename: string;
  width?: number | null;
  height?: number | null;
  mpp_x?: number | null;
  mpp_y?: number | null;
  vendor?: string | null;
}

export interface PermissionCatalog {
  all: Permission[];
  groups: Record<string, Permission[]>;
  default_member: Permission[];
}
