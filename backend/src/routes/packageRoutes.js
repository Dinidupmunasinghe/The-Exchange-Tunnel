const express = require("express");
const { listPublicPackages } = require("../controllers/packageController");

const router = express.Router();

router.get("/", listPublicPackages);

module.exports = router;
