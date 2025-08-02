import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import qrcode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import env from "dotenv";

const app = express();
// const port = 3000;
const port = process.env.PORT || 3000;
env.config();

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/qrImages", express.static("qrImages"));
app.use("/product_pdf", express.static("public/product_pdf"));
app.use("/product_jpeg", express.static("public/product_jpeg"));

app.use(passport.initialize());
app.use(passport.session());

// const db = new pg.Client({
//   user: process.env.USER,
//   host: process.env.HOST,
//   port: process.env.PORT,
//   password: process.env.PASSWORD,
//   database: process.env.DATABASE,
// });

// const db = new pg.Client({
//   user: process.env.PG_USER,
//   host: process.env.PG_HOST,
//   port: process.env.PG_PORT,
//   password: process.env.PG_PASSWORD,
//   database: process.env.PG_DATABASE,
// });
// db.connect();

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Supabase requires SSL for external connections
  },
});
db.connect();

// Configure storage for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.mimetype === "application/pdf") {
      cb(null, "public/product_pdf/");
    } else if (file.mimetype === "image/jpeg") {
      cb(null, "public/product_jpeg/");
    }
  },
  filename: function (req, file, cb) {
    const ptype = req.body.product_type;
    // console.log(req.body);
    const ext = file.mimetype === "application/pdf" ? ".pdf" : ".jpeg";
    cb(null, `${ptype}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Only accept PDF and JPEG files
    if (file.mimetype === "application/pdf" || file.mimetype === "image/jpeg") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and JPEG files are allowed"));
    }
  },
});

// GET Request ---------------------------------------------------------------------

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/dashboard", async (req, res) => {
  if (req.isAuthenticated()) {
    const result = await db.query("SELECT COUNT(*) FROM customers");
    const customerQrScanned = result.rows[0].count;

    const result1 = await db.query("SELECT COUNT(*) FROM gtin_registration");
    const totalGTIN = result1.rows[0].count;

    const result2 = await db.query("SELECT COUNT(*) FROM products");
    const totalProduct = result2.rows[0].count;

    res.render("dashboard.ejs", {
      numberOfCustomers: customerQrScanned,
      totalGTIN: totalGTIN,
      totalProduct: totalProduct,
    });
  } else {
    res.redirect("/");
  }
});

app.get("/adminpanel", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("adminpanel.ejs");
  } else {
    res.redirect("/");
  }
});

app.get("/gtinRegister", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("gtinRegister.ejs");
  } else {
    res.redirect("/");
  }
});

app.get("/delete_batch", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("deleteBatch.ejs");
  } else {
    res.redirect("/");
  }
});

app.get("/delete_gtin", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("delete_gtin.ejs");
  } else {
    res.redirect("/");
  }
});

app.get("/delete_batch_toDashboard", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("deleteBatch_toDashboard.ejs");
  } else {
    res.redirect("/");
  }
});

app.get("/displayUpdate", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("displayUpdate.ejs");
  } else {
    res.redirect("/");
  }
});

// app.get("/view_database", async (req, res) => {
//   if (req.isAuthenticated()) {
//     try {
//       const result = await db.query("SELECT * FROM products ORDER BY id");

//       const result2 = await db.query(
//         "SELECT product_name FROM gtin_registration WHERE gtin = $1",
//         []
//       );

//       res.render("viewDatabase.ejs", { products: result.rows });
//       console.log(result);
//     } catch (err) {
//       console.error(err);
//       res.status(500).send("Error fetching products");
//     }
//   } else {
//     res.redirect("/");
//   }
// });

app.get("/view_database", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      let result = await db.query(`
        SELECT 
        p.id,
        p.batch,
        p.gtin,
        TO_CHAR(p.mfg_date, 'DD/MM/YYYY') AS mfg_date,
        TO_CHAR(p.exp_date, 'DD/MM/YYYY') AS exp_date,
        g.product_name
      FROM products p
      LEFT JOIN gtin_registration g ON p.gtin = g.gtin
      ORDER BY p.id;

      `);

      result = result.rows;

      const queryBatch = req.query.batch?.toLowerCase();

      if (queryBatch) {
        result = await db.query(
          `SELECT 
            p.id, p.batch, p.gtin, 
            TO_CHAR(p.mfg_date, 'DD/MM/YYYY') AS mfg_date, 
            TO_CHAR(p.exp_date, 'DD/MM/YYYY') AS exp_date, 
            g.product_name 
          FROM products p 
          LEFT JOIN gtin_registration g ON p.gtin = g.gtin 
          WHERE LOWER(p.batch) LIKE $1 
          ORDER BY p.id`,
          [`%${queryBatch}%`]
        );
        result = result.rows;
      }

      res.render("viewDatabase.ejs", { products: result || [], queryBatch });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching products");
    }
  } else {
    res.redirect("/");
  }
});

app.get("/logoutSure", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("logout.ejs");
  } else {
    res.redirect("/");
  }
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/clientui", async (req, res) => {
  const batch = req.query.batch;
  console.log(batch);
  if (!batch) return res.status(400).send("Missing batch parameter.");

  try {
    const result = await db.query(
      `
        SELECT p.*, g.product_name, g.product_type
        FROM products p
        LEFT JOIN gtin_registration g ON p.gtin = g.gtin
        WHERE p.batch = $1
      `,
      [batch]
    );
    if (result.rows.length === 0) {
      return res.status(404).send("Product not found.");
    }

    const product = result.rows[0];
    res.render("clientui.ejs", { product: product });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error.");
  }
});

app.get("/adminclientui", async (req, res) => {
  if (req.isAuthenticated()) {
    const batch = req.query.batch;
    if (!batch) return res.status(400).send("Missing batch parameter.");

    try {
      const result = await db.query(
        `
        SELECT p.*, g.product_name, g.product_type
        FROM products p
        LEFT JOIN gtin_registration g ON p.gtin = g.gtin
        WHERE p.batch = $1
      `,
        [batch]
      );

      if (result.rows.length === 0) {
        return res.status(404).send("Product not found.");
      }

      const product = result.rows[0];
      res.render("adminClientui.ejs", { product: product });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error.");
    }
  } else {
    res.redirect("/");
  }
});

app.get("/adminclientui_qr", async (req, res) => {
  if (req.isAuthenticated()) {
    const batch = req.query.batch;
    if (!batch) return res.status(400).send("Missing batch parameter.");

    try {
      const result = await db.query(
        `
        SELECT p.*, g.product_name, product_type
        FROM products p
        LEFT JOIN gtin_registration g ON p.gtin = g.gtin
        WHERE p.batch = $1
      `,
        [batch]
      );

      if (result.rows.length === 0) {
        return res.status(404).send("Product not found.");
      }

      const product = result.rows[0];
      res.render("adminClientui_qr.ejs", { product: product });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error.");
    }
  } else {
    res.redirect("/");
  }
});

app.get("/deleteQR", (req, res) => {
  if (req.isAuthenticated()) {
    const batch = req.query.batch;
    console.log(batch);

    if (!batch) {
      return res.status(400).send("Missing batch number in query.");
    }

    const qrPath = path.join("qrImages", `${batch}_qr.png`);

    fs.access(qrPath, fs.constants.F_OK, (err) => {
      if (err) {
        return res
          .status(404)
          .send(
            `<script>alert("QR image not found."); window.location.href="/view_database";</script>`
          );
      }

      fs.unlink(qrPath, (err) => {
        if (err) {
          console.error("Error deleting image:", err);
          return res
            .status(500)
            .send(
              `<script>alert("Failed to delete QR image."); window.location.href="/view_database";</script>`
            );
        }

        res.send(
          `<script>alert("✅ QR image deleted successfully."); window.location.href="/view_database";</script>`
        );
      });
    });
  } else {
    res.redirect("/");
  }
});

app.get("/generateQR", (req, res) => {
  if (req.isAuthenticated()) {
    const batch = req.query.batch;
    console.log(batch);

    const domain = process.env.DOMAIN;
    const productURL = `${domain}/verify/?batch=${batch}`;

    qrcode.toFile(
      `qrImages/${batch}_qr.png`,
      productURL,
      {
        color: {
          dark: "#000", // QR code color
          light: "#FFF", // Background color
        },
      },
      function (err) {
        if (err) {
          console.error(err);
          res.status(500).send("Error generating QR code.");
          return;
        }

        // 🚀 Redirect to the client UI after QR is saved
        res.redirect(`/adminclientui?batch=${batch}`);
      }
    );
  } else {
    res.redirect("/");
  }
});

app.get("/deleteQR_qr", (req, res) => {
  if (req.isAuthenticated()) {
    const batch = req.query.batch;
    console.log(batch);

    if (!batch) {
      return res.status(400).send("Missing batch number in query.");
    }

    const qrPath = path.join("qrImages", `${batch}_qr.png`);

    fs.access(qrPath, fs.constants.F_OK, (err) => {
      if (err) {
        return res
          .status(404)
          .send(
            `<script>alert("QR image not found."); window.location.href="/qrdatabase";</script>`
          );
      }

      fs.unlink(qrPath, (err) => {
        if (err) {
          console.error("Error deleting image:", err);
          return res
            .status(500)
            .send(
              `<script>alert("Failed to delete QR image."); window.location.href="/qrdatabase";</script>`
            );
        }

        res.send(
          `<script>alert("✅ QR image deleted successfully."); window.location.href="/qrdatabase";</script>`
        );
      });
    });
  } else {
    res.redirect("/");
  }
});

app.get("/generateQR_qr", (req, res) => {
  if (req.isAuthenticated()) {
    const batch = req.query.batch;
    console.log(batch);

    const domain = process.env.DOMAIN;
    const productURL = `${domain}/verify/?batch=${batch}`;

    qrcode.toFile(
      `qrImages/${batch}_qr.png`,
      productURL,
      {
        color: {
          dark: "#000", // QR code color
          light: "#FFF", // Background color
        },
      },
      function (err) {
        if (err) {
          console.error(err);
          res.status(500).send("Error generating QR code.");
          return;
        }

        // 🚀 Redirect to the client UI after QR is saved
        res.redirect(`/adminclientui_qr?batch=${batch}`);
      }
    );
  } else {
    res.redirect("/");
  }
});

app.get("/downloadQR", (req, res) => {
  if (req.isAuthenticated()) {
    const batch = req.query.batch;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const filePath = path.join(__dirname, "qrImages", `${batch}_qr.png`);

    res.download(filePath, `${batch}_qr.png`, (err) => {
      if (err) {
        console.error("Download failed:", err);
        res.status(404).send("QR code not found.");
      }
    });
  } else {
    res.redirect("/");
  }
});

app.get("/verify", (req, res) => {
  const batch = req.query.batch;
  res.render("verify.ejs", { batch });
});

app.get("/customerdatabase", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      let result = await db.query(
        "SELECT * FROM customers ORDER BY customer_id"
      );

      result = result.rows;

      const queryBatch = req.query.batch?.toLowerCase();
      const location = req.query.location?.toLowerCase();

      if (queryBatch && location) {
        result = await db.query(
          "SELECT * FROM customers WHERE batch ILIKE $1 AND location ILIKE $2 ORDER BY customer_id",
          [`%${queryBatch}%`, `%${location}%`]
        );
        result = result.rows;
      } else if (queryBatch) {
        result = await db.query(
          "SELECT * FROM customers WHERE batch ILIKE $1 ORDER BY customer_id",
          [`%${queryBatch}%`]
        );
        result = result.rows;
      } else if (location) {
        result = await db.query(
          "SELECT * FROM customers WHERE location ILIKE $1 ORDER BY customer_id",
          [`%${location}%`]
        );
        result = result.rows;
      } else {
        result = await db.query("SELECT * FROM customers ORDER BY customer_id");
        result = result.rows;
      }

      res.render("customerdatabase.ejs", {
        customers: result,
        queryBatch,
        location,
      });
      console.log(result);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching customer");
    }
  } else {
    res.redirect("/");
  }
});

app.get("/gtinDatabase", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      let result = await db.query(
        "SELECT * FROM gtin_registration ORDER BY id"
      );

      result = result.rows;
      const gtin = req.query.gtin?.toLowerCase();
      if (gtin) {
        result = await db.query(
          "SELECT * FROM gtin_registration WHERE gtin ILIKE $1 ORDER BY id",
          [`%${gtin}%`]
        );
        result = result.rows;
      }

      res.render("gtinDatabase.ejs", { gtinReg: result, gtin });
      console.log(result);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching GTIN");
    }
  } else {
    res.redirect("/");
  }
});

// app.get("/qrdatabase", (req, res) => {
//   const __filename = fileURLToPath(import.meta.url);
//   const __dirname = path.dirname(__filename);

//   const qrDir = path.join(__dirname, "qrImages");

//   fs.readdir(qrDir, (err, files) => {
//     if (err) return res.send("Error reading QR folder");

//     const qrData = files
//       .filter((file) => file.endsWith("_qr.png"))
//       .map((file, index) => {
//         const batch = file.replace("_qr.png", "");
//         return {
//           id: index + 1,
//           batch,
//           qrPath: `/qrImages/${file}`,
//         };
//       });

//     res.render("qrdatabase", { qrData });
//   });
// });

app.get("/qrdatabase", (req, res) => {
  if (req.isAuthenticated()) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const qrDir = path.join(__dirname, "qrImages");

    const queryBatch = req.query.batch?.toLowerCase();

    fs.readdir(qrDir, (err, files) => {
      if (err) return res.send("Error reading QR folder");

      let qrData = files
        .filter((file) => file.endsWith("_qr.png"))
        .map((file, index) => {
          const batch = file.replace("_qr.png", "");
          return {
            id: index + 1,
            batch,
            qrPath: `/qrImages/${file}`,
          };
        });

      // Apply search filter if query exists
      if (queryBatch) {
        qrData = qrData.filter((record) =>
          record.batch.toLowerCase().includes(queryBatch)
        );
      }

      res.render("qrdatabase", { qrData, queryBatch });
    });
  } else {
    res.redirect("/");
  }
});

app.get("/display", (req, res) => {
  if (req.isAuthenticated()) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const pdfDir = path.join(__dirname, "public/product_pdf");
    const imgDir = path.join(__dirname, "public/product_jpeg");

    // Get all PDF and image files
    const pdfFiles = fs.readdirSync(pdfDir).map((f) => path.parse(f).name);
    const imgFiles = fs.readdirSync(imgDir).map((f) => path.parse(f).name);

    // Combine all unique product types
    const allFiles = [...new Set([...pdfFiles, ...imgFiles])];

    // Prepare file data for the view
    let files = allFiles
      .map((productType) => ({
        productType,
        hasPDF: pdfFiles.includes(productType),
        hasImage: imgFiles.includes(productType),
      }))
      .sort((a, b) => a.productType.localeCompare(b.productType));

    const pDisplay = req.query.pdisplay;
    // Apply search filter if query exists
    if (pDisplay) {
      files = files.filter((record) =>
        record.productType.toLowerCase().includes(pDisplay.toLowerCase())
      );
    }

    res.render("display", { files, pDisplay });
  } else {
    res.redirect("/");
  }
});

// Route to serve PDF files with download
app.get("/product_pdf/:filename", (req, res) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const filePath = path.join(
    __dirname,
    "public/product_pdf",
    req.params.filename
  );

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send("PDF not found");
  }
});

app.get("/error", (req, res) => {
  res.render("error.ejs");
});

// POST -----------------------------------------------------------------

app.post("/submitCustomer", async (req, res) => {
  const { name, phone, location, batch } = req.body;

  // console.log(name);
  // console.log(phone);
  console.log("The Location from Server");
  console.log(location);
  // console.log(batch);

  await db.query(
    "INSERT INTO customers (name, phone, location, batch) VALUES ($1, $2, $3, $4)",
    [name, phone, location, batch]
  );

  res.redirect(`/clientui?batch=${batch}`);
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/dashboard",
    failureRedirect: "/",
  })
);

function convertDMYtoISO(dateStr) {
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month}-${day}`; // e.g. '2025-08-28'
}

// app.post("/submit_product", async (req, res) => {
//   const gtin = req.body.gtin;
//   // const productName = req.body.productName;
//   const eDate = req.body.expDate;
//   const mDate = req.body.mfgDate;
//   const batch = req.body.batchNumber;

//   const result0 = await db.query(
//     "SELECT * FROM gtin_registration WHERE gtin = $1",
//     [gtin]
//   );

//   if (result0.rows.length > 0) {
//     const result = await db.query("SELECT * FROM products WHERE batch = $1", [
//       batch,
//     ]);

//     if (result.rows.length === 0) {
//       await db.query(
//         "INSERT INTO products (batch, gtin, mfg_date, exp_date) VALUES ($1, $2, $3, $4)",
//         [batch, gtin, mDate, eDate]
//       );

//       const domain = process.env.DOMAIN;
//       const productURL = `${domain}/verify/?batch=${batch}`;
//       // Generate QR code and save as PNG file
//       // const fs = await import("fs");
//       qrcode.toFile(
//         `qrImages/${batch}_qr.png`,
//         productURL,
//         {
//           color: {
//             dark: "#000", // QR code color
//             light: "#FFF", // Background color
//           },
//         },
//         function (err) {
//           if (err) console.error(err);
//         }
//       );

//       res.redirect("/adminpanel");
//     } else {
//       res.send("Batch Already Exist");
//     }
//   } else {
//     res.send("GTIN is Not Registered, Enter a Valid GTIN");
//   }
// });

app.post("/submit_product", async (req, res) => {
  const gtin = req.body.gtin;
  const batch = req.body.batchNumber;

  // Convert dates to ISO format
  const mDate = convertDMYtoISO(req.body.mfgDate);
  const eDate = convertDMYtoISO(req.body.expDate);

  try {
    const result0 = await db.query(
      "SELECT * FROM gtin_registration WHERE gtin = $1",
      [gtin]
    );

    if (result0.rows.length > 0) {
      const result = await db.query("SELECT * FROM products WHERE batch = $1", [
        batch,
      ]);

      if (result.rows.length === 0) {
        await db.query(
          "INSERT INTO products (batch, gtin, mfg_date, exp_date) VALUES ($1, $2, $3, $4)",
          [batch, gtin, mDate, eDate]
        );

        const domain = process.env.DOMAIN;
        const productURL = `${domain}/verify/?batch=${batch}`;

        qrcode.toFile(
          `qrImages/${batch}_qr.png`,
          productURL,
          {
            color: {
              dark: "#000",
              light: "#FFF",
            },
          },
          function (err) {
            if (err) console.error(err);
          }
        );

        res.redirect("/adminpanel");
      } else {
        res.render("error.ejs", {
          title: "Duplicate Batch",
          message: "Batch Already Exist.",
        });
        // res.send("Batch Already Exist");
      }
    } else {
      // res.send("GTIN is Not Registered, Enter a Valid GTIN");
      res.render("error.ejs", {
        title: "Invalid GTIN",
        message: "GTIN is Not Registered, Enter a Valid GTIN",
      });
    }
  } catch (err) {
    console.error("Submit Product Error:", err.message);
    res.status(500).send("Server Error: Could not submit product.");
  }
});

// app.post("/submit_gtin", async (req, res) => {
//   const gtin = req.body.gtin;
//   // const productName = req.body.productName;
//   // const eDate = req.body.expDate;
//   const product_type = req.body.product_type;
//   const product_name = req.body.product_name;

//   const result = await db.query(
//     "SELECT * FROM gtin_registration WHERE gtin = $1",
//     [gtin]
//   );

//   if (result.rows.length === 0) {
//     await db.query(
//       "INSERT INTO gtin_registration (gtin, product_name, product_type) VALUES ($1, $2, $3)",
//       [gtin, product_name, product_type]
//     );

//     res.redirect("/gtinRegister");
//   } else {
//     res.send("Batch Already Exist");
//   }
// });

app.post("/submit_gtin", async (req, res) => {
  const gtin = req.body.gtin;
  const product_type = req.body.product_type;
  const product_name = req.body.product_name;

  try {
    const result = await db.query(
      "SELECT * FROM gtin_registration WHERE gtin = $1",
      [gtin]
    );

    if (result.rows.length === 0) {
      await db.query(
        "INSERT INTO gtin_registration (gtin, product_name, product_type) VALUES ($1, $2, $3)",
        [gtin, product_name, product_type]
      );

      res.redirect("/gtinRegister");
    } else {
      res.render("error.ejs", {
        title: "Duplicate GTIN",
        message: "GTIN Already Exist.",
      });
      // res.send("GTIN Already Exists");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing your request GTIN");
  }
});

app.post(
  "/update_display",
  upload.fields([
    { name: "leaflet", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  async (req, res) => {
    const product_type = req.body.product_type;

    try {
      const result = await db.query(
        "SELECT * FROM gtin_registration WHERE product_type = $1",
        [product_type]
      );

      if (result.rows.length > 0) {
        res.redirect("/dashboard");

        // res.redirect("/gtinRegister");
      } else {
        // Delete uploaded files if GTIN already exists
        if (req.files["leaflet"]) {
          fs.unlinkSync(req.files["leaflet"][0].path);
        }
        if (req.files["image"]) {
          fs.unlinkSync(req.files["image"][0].path);
        }
        res.render("error.ejs", {
          title: "Invalid Product",
          message: "Invalid Product Name",
        });
        // res.send("Invalid Product Name");
      }
    } catch (err) {
      console.error(err);
      // Delete uploaded files if error occurs
      if (req.files["leaflet"]) {
        fs.unlinkSync(req.files["leaflet"][0].path);
      }
      if (req.files["image"]) {
        fs.unlinkSync(req.files["image"][0].path);
      }
      res.status(500).send("Error processing your request");
    }
  }
);

app.post("/delete_batch", async (req, res) => {
  const batch = req.body.batchNumber;

  try {
    const result = await db.query("SELECT * FROM products WHERE batch = $1", [
      batch,
    ]);

    if (result.rows.length === 0) {
      return res.send(
        `<script>alert("No such batch found."); window.location.href="/delete_batch";</script>`
      );
    } else {
      await db.query("DELETE FROM products WHERE batch = $1", [batch]);

      const qrPath = path.join("qrImages", `${batch}_qr.png`);

      fs.access(qrPath, fs.constants.F_OK, (err) => {
        if (err) {
          return res
            .status(404)
            .send(
              `<script>alert("Batch Data Deletd but QR image not found in Server."); window.location.href="/view_database";</script>`
            );
        }

        fs.unlink(qrPath, (err) => {
          if (err) {
            console.error("Error deleting image:", err);
            return res
              .status(500)
              .send(
                `<script>alert("Failed to delete QR image."); window.location.href="/view_database";</script>`
              );
          }

          return res.send(
            `<script>alert("✅ QR image and Batch Data deleted successfully."); window.location.href="/view_database";</script>`
          );
        });
      });

      // return res.send(
      //   `<script>alert("✅ Batch deleted successfully."); window.location.href="/view_database";</script>`
      // );
    }
  } catch (err) {
    console.error(err);
    res.send(
      `<script>alert("Something went wrong."); window.location.href="/delete_batch";</script>`
    );
  }
});

app.post("/delete_gtin", async (req, res) => {
  const gtin = req.body.gtin;

  try {
    const result = await db.query(
      "SELECT * FROM gtin_registration WHERE gtin = $1",
      [gtin]
    );

    if (result.rows.length === 0) {
      return res.send(
        `<script>alert("No such GTIN found."); window.location.href="/delete_gtin";</script>`
      );
    } else {
      await db.query("DELETE FROM gtin_registration WHERE gtin = $1", [gtin]);
      `<script>alert("GTIN Deleted Successfully."); window.location.href="/gtinDatabase";</script>`;

      // res.redirect("/gtinDatabase");
    }
  } catch (err) {
    console.error(err);
    res.send(
      `<script>alert("Something went wrong."); window.location.href="/delete_gtin";</script>`
    );
  }
});

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const USERNAME = process.env.USERNAMEENV;
      const PASSWORD = process.env.PASSWORDENV;

      // const USERNAME = "Shivam@123";
      // const PASSWORD = "123";

      if (username === USERNAME && password === PASSWORD) {
        return cb(null, username);

        // res.render("adminpanel.ejs");
      } else {
        return cb(null, false);
        // res.render("home.ejs");
      }
    } catch (err) {
      console.log(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});

// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });

app.listen(port, "0.0.0.0");
