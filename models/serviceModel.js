import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessCompanyName: {
    type: String,
    required: true,
    trim: true
  },
  tradeLicenseNumber: {
    type: String,
    required: true,
    trim: true
  },
  tradeLicenseCopy: {
    type: String, // URL or path to uploaded file
    required: true
  },
  companyType: {
    type: String,
    required: true,
    trim: true
  },
  businessPhoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  alternativePhoneNumber: {
    type: String,
    trim: true
  },
  managerOwnerReceptionName: {
    type: String,
    required: true,
    trim: true
  },
  contactPersonMobile: {
    type: String,
    required: true,
    trim: true
  },
  businessAddress: {
    type: String,
    required: true,
    trim: true
  },
  shopImages: [{
    type: String // URLs or paths to uploaded files
  }],
  ownerIdentification: {
    fullName: { type: String, required: true },
    emiratesId: { type: String, required: true }
  },
  passportCopy: [{
    type: String // URLs or paths to uploaded files
  }],
  serviceType: {
    type: String,
    required: true,
    trim: true
  },
  openingTime: {
    type: String,
    required: true
  },
  closingTime: {
    type: String,
    required: true
  },
  numberOfStaff: {
    type: Number,
    required: true
  },
  availableServices: [{
    type: String,
    trim: true
  }],
  listOfServices: {
    type: String,
    required: true
  },
  serviceArea: {
    type: String,
    required: true,
    trim: true
  },
  uploadedPriceList: {
    type: String // URL or path to uploaded file
  },
  uploadedPortfolio: {
    type: String // URL or path to uploaded file
  },
  agreeToTermsConditions: {
    type: Boolean,
    required: true
  },
  backgroundChecks: {
    type: Boolean,
    required: true
  },
  digitalOrTypedSignature: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Service', serviceSchema);