import mongoose from "mongoose";

const walletSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "global" },
    withdrawalSettings: {
      frequency: { type: String, enum: ["daily", "weekly", "monthly"], default: "monthly" },
      dailyLimitPerUser: { type: Number, default: 0 },
      weeklyLimit: { type: Number, default: 0 }
    },
    freezeRules: {
      blockIfUserFlagged: { type: Boolean, default: true },
      blockIfKycIncomplete: { type: Boolean, default: true },
      blockIfSameAccountUsedByMultiple: { type: Boolean, default: true },
      cancellationAbuseThreshold: { type: Number, default: 3 },
      suspiciousTopupsCardReuseThreshold: { type: Number, default: 3 }
    },
    alerts: {
      enabled: { type: Boolean, default: true },
      lowBalanceThreshold: { type: Number, default: 0 },
      notifyEmail: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

export default mongoose.model("WalletSettings", walletSettingsSchema);

