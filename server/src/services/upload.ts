import multer from "multer";

export const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) => {
      cb(null, Date.now() + "-" + file.originalname);
    }
  })
});
