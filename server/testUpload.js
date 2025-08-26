import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

const form = new FormData();
form.append("file", fs.createReadStream("./test.txt")); // uses test.txt inside /server

const res = await fetch("http://localhost:5000/api/upload", {
  method: "POST",
  body: form,
  headers: form.getHeaders(),
});

const data = await res.json();
console.log("📤 Upload response:", data);
