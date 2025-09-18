import Post from "../models/postModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";


// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create a new post
const createPost = asyncHandler(async (req, res) => {
  const { content } = req.body;
  const userId = req.user._id;

  if (!content) {
    res.status(400);
    throw new Error("Post content is required");
  }

  const mediaPaths = req.files?.media
    ? req.files.media.map((file) =>
        path.join("uploads", file.filename).replace(/\\/g, "/")
      )
    : [];

  const post = await Post.create({
    content,
    author: userId,
    media: mediaPaths,
  });

  const populatedPost = await Post.findById(post._id)
    .populate("author", "username firstName lastName")
    .lean();

  res.status(201).json({
    success: true,
    message: "Post created successfully",
    post: {
      ...populatedPost,
      author: {
        id: populatedPost.author._id,
        username: populatedPost.author.username,
        name: `${populatedPost.author.firstName}${
          populatedPost.author.lastName
            ? " " + populatedPost.author.lastName
            : ""
        }`,
      },
    },
  });
});

// Get all posts (feed)
const getFeed = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const posts = await Post.find({})
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate("author", "username firstName lastName")
    .populate("comments.author", "username firstName lastName")
    .lean();

  const totalPosts = await Post.countDocuments();

  const formattedPosts = posts.map((post) => ({
    ...post,
    author: {
      id: post.author._id,
      username: post.author.username,
      name: `${post.author.firstName}${
        post.author.lastName ? " " + post.author.lastName : ""
      }`,
    },
    comments: post.comments.map((comment) => ({
      ...comment,
      author: {
        id: comment.author._id,
        username: comment.author.username,
        name: `${comment.author.firstName}${
          comment.author.lastName ? " " + comment.author.lastName : ""
        }`,
      },
    })),
  }));

  res.status(200).json({
    success: true,
    message: "Feed retrieved successfully",
    posts: formattedPosts,
    totalPosts,
    currentPage: parseInt(page),
    totalPages: Math.ceil(totalPosts / parseInt(limit)),
  });
});

// Get posts by user
const getUserPosts = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!mongoose.isValidObjectId(userId)) {
    res.status(400);
    throw new Error("Invalid user ID format");
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const posts = await Post.find({ author: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate("author", "username firstName lastName")
    .populate("comments.author", "username firstName lastName")
    .lean();

  const totalPosts = await Post.countDocuments({ author: userId });

  const formattedPosts = posts.map((post) => ({
    ...post,
    author: {
      id: post.author._id,
      username: post.author.username,
      name: `${post.author.firstName}${
        post.author.lastName ? " " + post.author.lastName : ""
      }`,
    },
    comments: post.comments.map((comment) => ({
      ...comment,
      author: {
        id: comment.author._id,
        username: comment.author.username,
        name: `${comment.author.firstName}${
          comment.author.lastName ? " " + comment.author.lastName : ""
        }`,
      },
    })),
  }));

  res.status(200).json({
    success: true,
    message: "User posts retrieved successfully",
    posts: formattedPosts,
    totalPosts,
    currentPage: parseInt(page),
    totalPages: Math.ceil(totalPosts / parseInt(limit)),
  });
});

// Update a post
const updatePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(postId)) {
    res.status(400);
    throw new Error("Invalid post ID format");
  }

  if (!content) {
    res.status(400);
    throw new Error("Post content is required");
  }

  const post = await Post.findById(postId);
  if (!post) {
    res.status(404);
    throw new Error("Post not found");
  }

  if (post.author.toString() !== userId.toString()) {
    res.status(403);
    throw new Error("You can only edit your own posts");
  }

  const mediaPaths = req.files?.media
    ? req.files.media.map((file) =>
        path.join("uploads", file.filename).replace(/\\/g, "/")
      )
    : post.media;

  post.content = content;
  post.media = mediaPaths;
  await post.save();

  const populatedPost = await Post.findById(post._id)
    .populate("author", "username firstName lastName")
    .populate("comments.author", "username firstName lastName")
    .lean();

  res.status(200).json({
    success: true,
    message: "Post updated successfully",
    post: {
      ...populatedPost,
      author: {
        id: populatedPost.author._id,
        username: populatedPost.author.username,
        name: `${populatedPost.author.firstName}${
          populatedPost.author.lastName
            ? " " + populatedPost.author.lastName
            : ""
        }`,
      },
      comments: populatedPost.comments.map((comment) => ({
        ...comment,
        author: {
          id: comment.author._id,
          username: comment.author.username,
          name: `${comment.author.firstName}${
            comment.author.lastName ? " " + comment.author.lastName : ""
          }`,
        },
      })),
    },
  });
});

// Delete a post
const deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(postId)) {
    res.status(400);
    throw new Error("Invalid post ID format");
  }

  const post = await Post.findById(postId);
  if (!post) {
    res.status(404);
    throw new Error("Post not found");
  }

  // Check if user is the author, admin, or superadmin
  const user = await User.findById(userId).select("role");
  const isAuthor = post.author.toString() === userId.toString();
  const isAdminOrSuperadmin = user && ["admin", "superadmin"].includes(user.role);
  
  if (!isAuthor && !isAdminOrSuperadmin) {
    res.status(403);
    throw new Error("You can only delete your own posts");
  }

  // Delete associated media
  post.media.forEach((mediaPath) => {
    const fullPath = path.join(process.cwd(), mediaPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  });

  await Post.findByIdAndDelete(postId);

  res.status(200).json({
    success: true,
    message: "Post deleted successfully",
    postId,
  });
});

// Like a post
const likePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(postId)) {
    res.status(400);
    throw new Error("Invalid post ID format");
  }

  const post = await Post.findById(postId);
  if (!post) {
    res.status(404);
    throw new Error("Post not found");
  }

  if (post.likes.includes(userId)) {
    post.likes = post.likes.filter((id) => id.toString() !== userId.toString());
  } else {
    post.likes.push(userId);
  }

  await post.save();

  const populatedPost = await Post.findById(post._id)
    .populate("author", "username firstName lastName")
    .lean();

  res.status(200).json({
    success: true,
    message: post.likes.includes(userId)
      ? "Post liked successfully"
      : "Post unliked successfully",
    post: {
      ...populatedPost,
      author: {
        id: populatedPost.author._id,
        username: populatedPost.author.username,
        name: `${populatedPost.author.firstName}${
          populatedPost.author.lastName
            ? " " + populatedPost.author.lastName
            : ""
        }`,
      },
    },
  });
});

// Comment on a post
const commentOnPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(postId)) {
    res.status(400);
    throw new Error("Invalid post ID format");
  }

  if (!content) {
    res.status(400);
    throw new Error("Comment content is required");
  }

  const post = await Post.findById(postId);
  if (!post) {
    res.status(404);
    throw new Error("Post not found");
  }

  post.comments.push({
    author: userId,
    content,
    createdAt: new Date(),
  });

  await post.save();

  const populatedPost = await Post.findById(post._id)
    .populate("author", "username firstName lastName")
    .populate("comments.author", "username firstName lastName")
    .lean();

  res.status(200).json({
    success: true,
    message: "Comment added successfully",
    post: {
      ...populatedPost,
      author: {
        id: populatedPost.author._id,
        username: populatedPost.author.username,
        name: `${populatedPost.author.firstName}${
          populatedPost.author.lastName
            ? " " + populatedPost.author.lastName
            : ""
        }`,
      },
      comments: populatedPost.comments.map((comment) => ({
        ...comment,
        author: {
          id: comment.author._id,
          username: comment.author.username,
          name: `${comment.author.firstName}${
            comment.author.lastName ? " " + comment.author.lastName : ""
          }`,
        },
      })),
    },
  });
});

export {
  createPost,
  getFeed,
  getUserPosts,
  updatePost,
  deletePost,
  likePost,
  commentOnPost,
};
