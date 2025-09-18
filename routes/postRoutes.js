import express from "express";
import {
  createPost,
  getFeed,
  getUserPosts,
  updatePost,
  deletePost,
  likePost,
  commentOnPost,
} from "../controllers/postController.js";
// import authHandler from "../middlewares/authMiddleware.js";
import multer from "multer";
import path from "path";
import authHandler from "../middlewares/authMIddleware.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const router = express.Router();

// Post routes
router.post("/create", authHandler, upload.array("media", 5), createPost);
router.get("/feed", authHandler, getFeed);
router.get("/user/:userId", authHandler, getUserPosts);
router.put(
  "/update/:postId",
  authHandler,
  upload.array("media", 5),
  updatePost
);
router.delete("/:postId", authHandler, deletePost);
router.post("/like/:postId", authHandler, likePost);
router.post("/comment/:postId", authHandler, commentOnPost);

export default router;
