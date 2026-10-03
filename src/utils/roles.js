// Site roles, highest first: super admin > admin > user.
//
// Super admins manage admins (create, promote, demote) and can never be
// banned, deleted or edited by anyone else through the app. Admins moderate
// regular users only. Nobody manages an account of equal or higher rank -
// including their own, via the admin tools (so an admin can't lock
// themselves or a peer out).
export const rankOf = (user) => (user?.isSuperAdmin ? 2 : user?.isAdmin ? 1 : 0);

export const canManage = (actor, target) =>
  Boolean(actor && target) && String(actor._id) !== String(target._id) && rankOf(actor) > rankOf(target);

export const CANNOT_MANAGE_MESSAGE = "You can't manage this account.";
