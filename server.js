const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const cors = require("cors")

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static("."))

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Create products.json if it doesn't exist
const productsFile = path.join(__dirname, "products.json")
if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(productsFile, JSON.stringify([], null, 2))
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    // Get current products to determine next image number
    const products = readProducts()
    const imageNumber = products.length + 1
    const extension = path.extname(file.originalname)
    cb(null, `image${imageNumber}${extension}`)
  },
})

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed!"), false)
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
})

// Helper functions
function readProducts() {
  try {
    const data = fs.readFileSync(productsFile, "utf8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Error reading products:", error)
    return []
  }
}

function writeProducts(products) {
  try {
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2))
    return true
  } catch (error) {
    console.error("Error writing products:", error)
    return false
  }
}

// Routes

// Serve uploads directory
app.use("/uploads", express.static("uploads"))

// Get all products
app.get("/api/products", (req, res) => {
  const products = readProducts()
  res.json(products)
})

// Get product by tracking number
app.get("/api/products/:trackingNumber", (req, res) => {
  const products = readProducts()
  const product = products.find((p) => p.trackingNumber === req.params.trackingNumber)

  if (product) {
    res.json(product)
  } else {
    res.status(404).json({ error: "Product not found" })
  }
})

// Add new product
app.post("/api/products", upload.single("packageImage"), (req, res) => {
  try {
    const products = readProducts()

    // Parse form data
    const productData = {
      trackingNumber: req.body.trackingNumber || Math.random().toString().substr(2, 10),
      recipientName: req.body.recipientName,
      recipientAddress: req.body.recipientAddress,
      senderName: req.body.senderName,
      weight: Number.parseFloat(req.body.weight),
      serviceType: req.body.serviceType,
      status: req.body.status,
      estimatedDelivery: req.body.estimatedDelivery,
      packageImage: req.file
        ? `/uploads/${req.file.filename}`
        : req.body.imageUrl ||
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop&crop=center",
      events: [
        {
          description: "Package created",
          timestamp: new Date().toISOString(),
          location: "Origin facility",
          completed: true,
        },
      ],
      createdAt: new Date().toISOString(),
      isGlobal: false,
    }

    // Check if tracking number already exists
    if (products.find((p) => p.trackingNumber === productData.trackingNumber)) {
      return res.status(400).json({ error: "Tracking number already exists" })
    }

    // Add product to array
    products.push(productData)

    // Save to file
    if (writeProducts(products)) {
      res.status(201).json(productData)
    } else {
      res.status(500).json({ error: "Failed to save product" })
    }
  } catch (error) {
    console.error("Error adding product:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update product
app.put("/api/products/:trackingNumber", upload.single("packageImage"), (req, res) => {
  try {
    const products = readProducts()
    const index = products.findIndex((p) => p.trackingNumber === req.params.trackingNumber)

    if (index === -1) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Update product data
    const updatedProduct = {
      ...products[index],
      recipientName: req.body.recipientName || products[index].recipientName,
      recipientAddress: req.body.recipientAddress || products[index].recipientAddress,
      senderName: req.body.senderName || products[index].senderName,
      weight: req.body.weight ? Number.parseFloat(req.body.weight) : products[index].weight,
      serviceType: req.body.serviceType || products[index].serviceType,
      status: req.body.status || products[index].status,
      estimatedDelivery: req.body.estimatedDelivery || products[index].estimatedDelivery,
      packageImage: req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl || products[index].packageImage,
    }

    products[index] = updatedProduct

    if (writeProducts(products)) {
      res.json(updatedProduct)
    } else {
      res.status(500).json({ error: "Failed to update product" })
    }
  } catch (error) {
    console.error("Error updating product:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete product
app.delete("/api/products/:trackingNumber", (req, res) => {
  try {
    const products = readProducts()
    const index = products.findIndex((p) => p.trackingNumber === req.params.trackingNumber)

    if (index === -1) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Remove product from array
    const deletedProduct = products.splice(index, 1)[0]

    // Delete associated image file if it exists
    if (deletedProduct.packageImage && deletedProduct.packageImage.startsWith("/uploads/")) {
      const imagePath = path.join(__dirname, deletedProduct.packageImage)
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath)
      }
    }

    if (writeProducts(products)) {
      res.json({ message: "Product deleted successfully" })
    } else {
      res.status(500).json({ error: "Failed to delete product" })
    }
  } catch (error) {
    console.error("Error deleting product:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
