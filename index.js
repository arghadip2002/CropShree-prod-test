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

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/adminpanel", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("adminpanel.ejs");
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

app.get("/view_database", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const result = await db.query("SELECT * FROM products ORDER BY id");
      res.render("viewDatabase.ejs", { products: result.rows });
      console.log(result);
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
    const result = await db.query("SELECT * FROM products WHERE batch = $1", [
      batch,
    ]);
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
    console.log(batch);
    if (!batch) return res.status(400).send("Missing batch parameter.");

    try {
      const result = await db.query("SELECT * FROM products WHERE batch = $1", [
        batch,
      ]);
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
        res.redirect(`/adminclientui/?batch=${batch}`);
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
      const result = await db.query(
        "SELECT * FROM customers ORDER BY customer_id"
      );
      res.render("customerdatabase.ejs", { customers: result.rows });
      console.log(result);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching customer");
    }
  } else {
    res.redirect("/");
  }
});

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
    successRedirect: "/adminpanel",
    failureRedirect: "/",
  })
);

app.post("/submit_product", async (req, res) => {
  const gtin = req.body.gtin;
  const productName = req.body.productName;
  const eDate = req.body.expDate;
  const mDate = req.body.mfgDate;
  const batch = req.body.batchNumber;

  const result = await db.query("SELECT * FROM products WHERE batch = $1", [
    batch,
  ]);

  if (result.rows.length === 0) {
    await db.query(
      "INSERT INTO products (batch, gtin, mfg_date, exp_date, product_name) VALUES ($1, $2, $3,$4, $5)",
      [batch, gtin, mDate, eDate, productName]
    );

    const domain = process.env.DOMAIN;
    const productURL = `${domain}/verify/?batch=${batch}`;
    // Generate QR code and save as PNG file
    // const fs = await import("fs");
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
        if (err) console.error(err);
      }
    );

    res.redirect("/adminpanel");
  } else {
    res.send("Batch Already Exist");
  }
});

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

      return res.send(
        `<script>alert("✅ Batch deleted successfully."); window.location.href="/view_database";</script>`
      );
    }
  } catch (err) {
    console.error(err);
    res.send(
      `<script>alert("Something went wrong."); window.location.href="/delete_batch";</script>`
    );
  }
});

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const USERNAME = "Shivam@123";
      const PASSWORD = "123";

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
