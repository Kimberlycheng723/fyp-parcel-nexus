import assert from "node:assert/strict";
import test from "node:test";
import { getEmailFieldError, getPasswordFieldErrors } from "../src/utils/authValidation.js";

test("email validation supplies inline required and format errors", () => {
  assert.equal(getEmailFieldError("  "), "The Email field is required.");
  assert.equal(getEmailFieldError("not-an-email", true), "Enter a valid email address.");
  assert.equal(getEmailFieldError("resident@example.invalid"), "");
});

test("new and confirmation passwords receive their own field errors", () => {
  assert.deepEqual(getPasswordFieldErrors("", ""), {
    password: "The New Password field is required.", confirm: "The Confirm Password field is required."
  });
  assert.deepEqual(getPasswordFieldErrors("Abcdef1!", "Different1!"), { confirm: "Passwords do not match." });
  assert.deepEqual(getPasswordFieldErrors("weak", "weak"), { password: "Your password must meet all four requirements." });
  assert.deepEqual(getPasswordFieldErrors("Abcdef1!", "Abcdef1!"), {});
});
