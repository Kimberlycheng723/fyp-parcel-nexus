import assert from "node:assert/strict";
import test from "node:test";
import { validateCollectionDateFilter } from "../src/utils/parcelCollectionDateFilter.js";

test("collection dates are optional and use strict calendar dates", () => {
  assert.deepEqual(validateCollectionDateFilter({}), {});
  assert.deepEqual(validateCollectionDateFilter({ collected_from: "2024-02-29", collected_to: "2024-03-01" }), { collected_from: "2024-02-29", collected_to: "2024-03-01" });
  for (const value of [null, [], {}, 123, "", "0000-01-01", "2026-02-29", "2026-04-31", "2026-1-1", "2026-10-14T00:00:00Z", "2026-10-14' OR 1=1 --"]) {
    assert.equal(validateCollectionDateFilter({ collected_from: value }).error, "INVALID_COLLECTION_DATE_FILTER");
    assert.equal(validateCollectionDateFilter({ collected_to: value }).error, "INVALID_COLLECTION_DATE_FILTER");
  }
  assert.equal(validateCollectionDateFilter({ collected_from: "2026-10-15", collected_to: "2026-10-14" }).error, "INVALID_COLLECTION_DATE_FILTER");
});
