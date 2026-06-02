import { searchUnits } from "../services/unit.service.js";

export async function searchUnitsForRegistration(req, res) {
  const result = await searchUnits({
    search: req.query.search
  });

  return res.json(result);
}
