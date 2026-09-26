// Shared by operator and manager route trees. Each view renders one staff
// screen; the per-role page wrapper does the role check and supplies the
// basePath its links should use (/dashboard/operator or /dashboard/manager).
export type StaffViewProps = { basePath: string };
export type StaffDetailViewProps = StaffViewProps & { id: string };
export type StaffActorViewProps = StaffViewProps & { actorId: string };
// List views get the current page from the route's ?page= search param.
export type StaffListViewProps = StaffViewProps & { page: number };
export type StaffDetailListViewProps = StaffDetailViewProps & { page: number };
