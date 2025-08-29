const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const tempUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      minlength: [
        10,
        "Phone number must be exactly 13 characters including country code",
      ],
      maxlength: [
        13,
        "Phone number must be exactly 13 characters including country code",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
    },
    sponsorBy: { type: String, trim: true },
    gender: { type: String, enum: ["Male", "Female", "Other"], trim: true },
    otp: { type: String, required: true },
    otpExpires: { type: Date, required: true },
  },
  { timestamps: true }
);

tempUserSchema.index({ email: 1 });
tempUserSchema.index({ username: 1 });
tempUserSchema.index({ phoneNumber: 1 });
tempUserSchema.index({ otpExpires: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired OTPs

tempUserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

module.exports = mongoose.model("TempUser", tempUserSchema);