import asyncHandler from "express-async-handler";
import Offer from "../models/offerModel.js";

// Add new offer (Admin/Superadmin only)
const addOffer = asyncHandler(async (req, res) => {
  console.log("addOffer - req.body:", req.body); // Debug log
  console.log("addOffer - req.headers:", req.headers); // Debug log
  if (!req.body) {
    res.status(400);
    throw new Error("Request body is missing");
  }
  const { title, description, discount } = req.body;

  if (!title || !description || discount === undefined) {
    res.status(400);
    throw new Error("Title, description, and discount are required");
  }

  const offer = await Offer.create({
    title,
    description,
    discount,
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
    .populate("createdBy", "username firstName lastName");

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
    "username firstName lastName"
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
  console.log("updateOffer - req.headers:", req.headers); // Debug log
  console.log("updateOffer - req.params:", req.params); // Debug log
  if (!req.body) {
    res.status(400);
    throw new Error("Request body is missing");
  }
  const { id } = req.params;
  const { title, description, discount } = req.body;

  const offer = await Offer.findById(id);

  if (!offer) {
    res.status(404);
    throw new Error("Offer not found");
  }

  if (title) offer.title = title;
  if (description) offer.description = description;
  if (discount !== undefined) offer.discount = discount;

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

  const offer = await Offer.findByIdAndDelete(id);

  if (!offer) {
    res.status(404);
    throw new Error("Offer not found");
  }

  res.status(200).json({
    success: true,
    message: "Offer deleted successfully",
    offerId: id,
  });
});

export { addOffer, getAllOffers, getOfferById, updateOffer, deleteOffer };
