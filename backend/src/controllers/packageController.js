const db = require("../models");
const { serializeCreditPackage } = require("../utils/creditPackageSerializer");

async function listPublicPackages(req, res) {
  const rows = await db.CreditPackage.findAll({
    where: { isActive: true },
    order: [
      ["sortOrder", "ASC"],
      ["id", "ASC"]
    ]
  });
  return res.json({ packages: rows.map(serializeCreditPackage) });
}

module.exports = {
  listPublicPackages
};
