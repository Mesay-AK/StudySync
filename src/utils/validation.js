export const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

// undefined (field omitted) is allowed; anything present must be a string.
export const isOptionalString = (value) => value === undefined || typeof value === "string";

export const isStringArray = (value) => Array.isArray(value) && value.every((v) => typeof v === "string");

// Shared by public registration and admin-created accounts.
export const validateNewAccount = ({ username, email, password }) => {
  if (!isNonEmptyString(username) || !isNonEmptyString(email) || typeof password !== "string") {
    return "Username, email, and password are required.";
  }
  return null;
};
