import asyncHandler from "express-async-handler";
import Offer from "../models/offerModel.js";
import path from "path";
import fs from "fs";

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Add new offer (Admin/Superadmin only)
const addOffer = asyncHandler(async (req, res) => {
  console.log("addOffer - req.body:", req.body); // Debug log
  console.log("addOffer - req.file:", req.file); // Debug log for file upload
  console.log("addOffer - req.headers:", req.headers); // Debug log
  if (!req.body) {
    res.status(400);
    throw new Error("Request body is missing");
  }
  const { title, description } = req.body;

  // Handle picture upload
  let picturePath = null;
  if (req.file) {
    picturePath = req.file.path.replace(/\\/g, '/'); // Normalize path separators
  }

  const offer = await Offer.create({
    title: title || null,
    description: description || null,
    picture: picturePath,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: "Offer added successfully",
    offer,
  });
});

// Get all offers (Authenticated users)
const getAllOffers = asyncHandler(async (req, res) => {
  console.log("getAllOffers - req.headers:", req.headers); // Debug log
  const offers = await Offer.find({})
    .sort({ createdAt: -1 })
    .populate("createdBy", "username firstName lastName email phoneNumber selfieImage gender country role");

  res.status(200).json({
    success: true,
    message: "All offers retrieved successfully",
    offers,
    total: offers.length,
  });
});

// Get single offer by ID (Authenticated users)
const getOfferById = asyncHandler(async (req, res) => {
  console.log("getOfferById - req.params:", req.params); // Debug log
  console.log("getOfferById - req.headers:", req.headers); // Debug log
  const { id } = req.params;

  const offer = await Offer.findById(id).populate(
    "createdBy",
    "username firstName lastName email phoneNumber selfieImage gender country role"
  );

  if (!offer) {
    res.status(404);
    throw new Error("Offer not found");
  }

  res.status(200).json({
    success: true,
    message: "Offer retrieved successfully",
    offer,
  });
});

// Update offer (Admin/Superadmin only)
const updateOffer = asyncHandler(async (req, res) => {
  console.log("updateOffer - req.body:", req.body); // Debug log
  console.log("updateOffer - req.file:", req.file); // Debug log for file upload
  console.log("updateOffer - req.headers:", req.headers); // Debug log
  console.log("updateOffer - req.params:", req.params); // Debug log
  if (!req.body) {
    res.status(400);
    throw new Error("Request body is missing");
  }
  const { id } = req.params;
  const { title, description } = req.body;

  const offer = await Offer.findById(id);

  if (!offer) {
    res.status(404);
    throw new Error("Offer not found");
  }

  // Handle picture upload
  if (req.file) {
    // Delete old picture if it exists
    if (offer.picture && fs.existsSync(offer.picture)) {
      try {
        fs.unlinkSync(offer.picture);
      } catch (error) {
        console.log("Error deleting old picture:", error.message);
      }
    }
    offer.picture = req.file.path.replace(/\\/g, '/'); // Normalize path separators
  }

  if (title !== undefined) offer.title = title;
  if (description !== undefined) offer.description = description;

  await offer.save();

  res.status(200).json({
    success: true,
    message: "Offer updated successfully",
    offer,
  });
});

// Delete offer (Admin/Superadmin only)
const deleteOffer = asyncHandler(async (req, res) => {
  console.log("deleteOffer - req.params:", req.params); // Debug log
  console.log("deleteOffer - req.headers:", req.headers); // Debug log
  const { id } = req.params;

  const offer = await Offer.findById(id);

  if (!offer) {
    res.status(404);
    throw new Error("Offer not found");
  }

  // Delete associated picture file if it exists
  if (offer.picture && fs.existsSync(offer.picture)) {
    try {
      fs.unlinkSync(offer.picture);
    } catch (error) {
      console.log("Error deleting picture file:", error.message);
    }
  }

  await Offer.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Offer deleted successfully",
    offerId: id,
  });
});

// Like an offer (Authenticated users)
const likeOffer = asyncHandler(async (req, res) => {
  console.log("likeOffer - req.params:", req.params); // Debug log
  console.log("likeOffer - req.user:", req.user); // Debug log
  const { id } = req.params;
  const userId = req.user._id;

  const offer = await Offer.findById(id);

  if (!offer) {
    res.status(404);
    throw new Error("Offer not found");
  }

  // Check if user already liked this offer
  if (offer.likes.includes(userId)) {
    res.status(400);
    throw new Error("You have already liked this offer");
  }

  // Add user to likes array and increment like count
  offer.likes.push(userId);
  offer.likeCount = offer.likes.length;
  await offer.save();

  res.status(200).json({
    success: true,
    message: "Offer liked successfully",
    likeCount: offer.likeCount,
    isLiked: true,
  });
});

// Unlike an offer (Authenticated users)
const unlikeOffer = asyncHandler(async (req, res) => {
  console.log("unlikeOffer - req.params:", req.params); // Debug log
  console.log("unlikeOffer - req.user:", req.user); // Debug log
  const { id } = req.params;
  const userId = req.user._id;

  const offer = await Offer.findById(id);

  if (!offer) {
    res.status(404);
    throw new Error("Offer not found");
  }

  // Check if user has liked this offer
  if (!offer.likes.includes(userId)) {
    res.status(400);
    throw new Error("You have not liked this offer yet");
  }

  // Remove user from likes array and update like count
  offer.likes = offer.likes.filter(like => !like.equals(userId));
  offer.likeCount = offer.likes.length;
  await offer.save();

  res.status(200).json({
    success: true,
    message: "Offer unliked successfully",
    likeCount: offer.likeCount,
    isLiked: false,
  });
});

export { addOffer, getAllOffers, getOfferById, updateOffer, deleteOffer, likeOffer, unlikeOffer };
