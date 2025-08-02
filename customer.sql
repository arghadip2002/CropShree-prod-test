CREATE TABLE customers (
  customer_id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  phone VARCHAR(20),
  location VARCHAR(100),
  batch VARCHAR(100)
);

CREATE TABLE gtin_registration (
  id SERIAL,
  gtin VARCHAR(50) PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_type VARCHAR(100) NOT NULL

);

CREATE TABLE products (
  id SERIAL,
  batch VARCHAR(50) PRIMARY KEY,
  gtin VARCHAR(50) NOT NULL,
  mfg_date DATE NOT NULL,
  exp_date DATE NOT NULL
);

CREATE TABLE leaflet (
  id SERIAL,
  product_type VARCHAR(100) PRIMARY KEY,
  leaflet TEXT NOT NULL
);
