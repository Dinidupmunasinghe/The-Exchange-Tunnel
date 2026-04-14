const express = require("express");
const { body, param, oneOf } = require("express-validator");
const {
  createCampaign,
  listMyCampaigns,
  patchCampaign,
  deleteCampaign
} = require("../controllers/campaignController");
const validateRequest = require("../middleware/validateRequest");
const { ENGAGEMENT_TYPES } = require("../constants/engagement");

const router = express.Router();

router.post(
  "/",
  [
    body("name").optional().trim().isLength({ max: 160 }).withMessage("Name too long"),
    body("soundcloudPostId")
      .optional()
      .isString()
      .matches(/^(\d+(_\d+)?|sc_[a-f0-9]+)$/)
      .withMessage("soundcloudPostId must be a numeric post id or sc_ hash key"),
    body("facebookPostId")
      .optional()
      .isString()
      .matches(/^\d+(_\d+)?$/)
      .withMessage("facebookPostId must be a numeric post id"),
    oneOf(
      [
        body("soundcloudPostUrl").isURL().withMessage("Invalid soundcloudPostUrl"),
        body("facebookPostUrl").isURL().withMessage("Invalid facebookPostUrl")
      ],
      { message: "soundcloudPostUrl or facebookPostUrl must be a valid URL" }
    ),
    body("engagementType").isIn(ENGAGEMENT_TYPES).withMessage("Invalid engagement type"),
    body("creditsPerEngagement").isInt({ min: 1, max: 500 }),
    body("maxEngagements").isInt({ min: 1, max: 1000 }),
    body("scheduledLaunchAt")
      .optional({ values: "falsy" })
      .isISO8601()
      .withMessage("Invalid schedule date")
  ],
  validateRequest,
  createCampaign
);

router.get("/", listMyCampaigns);

router.patch(
  "/:id",
  [
    param("id").isInt({ min: 1 }),
    body("action").isIn(["pause", "resume"]).withMessage("action must be pause or resume")
  ],
  validateRequest,
  patchCampaign
);

router.delete("/:id", [param("id").isInt({ min: 1 })], validateRequest, deleteCampaign);

module.exports = router;
