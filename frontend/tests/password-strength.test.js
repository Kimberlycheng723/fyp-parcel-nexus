import assert from "node:assert/strict";
import test from "node:test";
import { getPasswordStrength } from "../src/utils/passwordStrength.js";
import { validatePasswordStrength } from "../../backend/src/utils/passwordValidation.js";

test("live requirements match the existing backend policy exactly", () => {
  for (const password of ["", "short", "abcdefgh", "ABCDEFGH", "12345678", "Abcdefgh", "Abcdefg1", "Abcde1!", "Abcdef1!", "Abcdef1 ", "Abcdef1é", "密码Aa123!", "Aa11111!"]) {
    const result = getPasswordStrength(password);
    const backend = validatePasswordStrength(password);
    assert.equal(result.isValid, backend.isValid, password);
    assert.equal(result.requirements.length, 4);
    assert.equal(result.score, result.requirements.filter((rule) => rule.met).length, password);
  }
});

test("combined letter rule still requires both uppercase and lowercase", () => {
  for (const value of ["ABCDEFG1!", "abcdefg1!"]) {
    assert.equal(getPasswordStrength(value).requirements.find((rule) => rule.id === "letters").met, false);
    assert.equal(getPasswordStrength(value).isValid, false);
  }
  assert.equal(getPasswordStrength("Abcdef1!").score, 4);
});

test("requirements update independently when characters are added or deleted", () => {
  assert.equal(getPasswordStrength("").score, 0);
  assert.equal(getPasswordStrength("a").label, "Weak");
  assert.equal(getPasswordStrength("Abcdefgh").label, "Fair");
  assert.equal(getPasswordStrength("Abcdef1!").label, "Strong");
  const removed = getPasswordStrength("Abcdef1");
  assert.equal(removed.isValid, false);
  assert.equal(removed.requirements.find((rule) => rule.id === "special").met, false);
  assert.equal(removed.requirements.find((rule) => rule.id === "length").met, false);
});
