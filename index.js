require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const Stripe = require("stripe");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "mentorlagbe-development-secret";
const stripe = process.env.STRIPE_SECRET_KEY?.trim()
  ? new Stripe(process.env.STRIPE_SECRET_KEY.trim())
  : null;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));

let db;
const collections = () => ({
  users: db.collection("users"),
  tuitions: db.collection("tuitions"),
  applications: db.collection("applications"),
  payments: db.collection("payments"),
});

async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db("mentorlagbe");
  await seedDatabase();
  console.log("Connected to MongoDB");
}

async function seedDatabase() {
  const c = collections();
  if (await c.users.countDocuments() === 0) {
    const passwordHash = await bcrypt.hash("Mentor@123", 10);
    await c.users.insertMany([
      { name: "Admin User", email: "admin@mentorlagbe.com", passwordHash, role: "admin", plan: "pro", phone: "", bio: "Platform administrator", image: "", createdAt: new Date(), updatedAt: new Date() },
      { name: "Dr. Nusrat Jahan", email: "tutor@mentorlagbe.com", passwordHash, role: "tutor", plan: "pro", phone: "+8801700000001", bio: "Mathematics and science educator", image: "", createdAt: new Date(), updatedAt: new Date() },
      { name: "Rahim Uddin", email: "student@mentorlagbe.com", passwordHash, role: "student", plan: "free", phone: "+8801700000002", bio: "Class 10 student", image: "", createdAt: new Date(), updatedAt: new Date() },
    ]);
  }
  if (await c.tuitions.countDocuments() === 0) {
    const tutor = await c.users.findOne({ role: "tutor" });
    const seed = [
      ["Advanced Mathematics Mastery", "Mathematics", "Class 10", "Online", "Dhaka", 6000, 3, "Build strong algebra, geometry and exam problem-solving skills.", "photo-1635070041078-e363dbe005cb"],
      ["Physics for University Admission", "Physics", "Admission", "Offline", "Dhanmondi, Dhaka", 7500, 4, "Focused mechanics, electricity and admission preparation.", "photo-1636466497217-26a8cbeaf0aa"],
      ["Full Stack Web Development", "Programming", "Adult", "Online", "Remote", 9000, 3, "Learn JavaScript, React, Node.js and databases through projects.", "photo-1498050108023-c5249f4df085"],
      ["IELTS Speaking and Writing", "IELTS", "Adult", "Online", "Remote", 5000, 2, "Target band 7 plus through guided speaking and writing practice.", "photo-1543269865-cbf427effbad"],
      ["Creative English for Beginners", "English", "Class 6", "Offline", "Mirpur, Dhaka", 4000, 3, "Grammar, vocabulary and communication in a friendly format.", "photo-1544717305-2782549b5136"],
      ["Organic Chemistry Deep Dive", "Chemistry", "Class 12", "Online", "Remote", 7000, 3, "Concept-based organic chemistry and exam practice.", "photo-1532094349884-543bc11b234d"],
      ["Bangla Literature Foundation", "Bangla", "Class 9", "Offline", "Uttara, Dhaka", 3500, 2, "Literature, grammar and exam writing practice.", "photo-1456513080510-7bf3a84b82f8"],
      ["SAT Math Intensive", "Mathematics", "SAT", "Online", "Remote", 8000, 4, "Timed drills and strategy for a high SAT math score.", "photo-1509062522246-3755977927d7"],
      ["HSC Biology Crash Course", "Biology", "Class 12", "Offline", "Banani, Dhaka", 6500, 3, "Complete HSC biology with diagrams and model tests.", "photo-1532187863486-abf9dbad1b69"],
      ["Python for Young Coders", "Programming", "Class 8", "Online", "Remote", 4500, 2, "A friendly introduction to Python and coding logic.", "photo-1515879218367-8466d910aaa4"],
      ["Accounting Fundamentals", "Accounting", "BBA", "Offline", "Mohakhali, Dhaka", 5500, 3, "Ledgers, journals and financial statements made practical.", "photo-1554224155-8d04cb21cd6c"],
      ["Business Studies Exam Prep", "Business Studies", "Class 10", "Online", "Remote", 3800, 2, "Clear concepts and strong board exam answer preparation.", "photo-1556761175-b413da4baf72"],
    ];
    await c.tuitions.insertMany(seed.map((x, i) => ({
      title: x[0], subject: x[1], classLevel: x[2], mode: x[3], location: x[4], monthlyFee: x[5], daysPerWeek: x[6],
      description: x[7], bannerImage: `https://images.unsplash.com/${x[8]}?auto=format&fit=crop&w=900&q=80`,
      tutorName: tutor?.name || "Dr. Nusrat Jahan", tutorEmail: tutor?.email || "tutor@mentorlagbe.com",
      approvalStatus: "approved", isActive: true, createdAt: new Date(Date.now() - i * 86400000),
    })));
  }
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const verifyToken = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ message: "Invalid token" }); }
};
const verifyRole = (role) => (req, res, next) => req.user?.role === role ? next() : res.status(403).json({ message: `${role} access required` });
const verifyStudent = verifyRole("student"), verifyTutor = verifyRole("tutor"), verifyAdmin = verifyRole("admin");

app.get("/api/health", (req, res) => res.json({ ok: true, service: "MentorLagbe API", database: "MongoDB" }));

app.post("/api/auth/sign-up", async (req, res) => {
  const { name, email, password, role = "student" } = req.body;
  if (!name || !email || password?.length < 6 || !["student", "tutor"].includes(role)) return res.status(400).json({ message: "Please provide valid name, email and password" });
  const c = collections(); const normalized = email.toLowerCase().trim();
  if (await c.users.findOne({ email: normalized })) return res.status(409).json({ message: "Email already exists" });
  const user = { name: name.trim(), email: normalized, passwordHash: await bcrypt.hash(password, 10), role, plan: "free", phone: "", bio: "", image: "", createdAt: new Date(), updatedAt: new Date() };
  const result = await c.users.insertOne(user);
  const token = jwt.sign({ _id: result.insertedId.toString(), email: normalized, role }, JWT_SECRET, { expiresIn: "7d" });
  const { passwordHash, ...safe } = user; res.status(201).json({ token, user: { ...safe, _id: result.insertedId } });
});

app.post("/api/auth/sign-in", async (req, res) => {
  const { email, password } = req.body; const c = collections();
  const user = await c.users.findOne({ email: String(email).trim().toLowerCase() });
  if (!user || !await bcrypt.compare(password || "", user.passwordHash)) return res.status(401).json({ message: "Invalid email or password" });
  const token = jwt.sign({ _id: user._id.toString(), email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
  const { passwordHash, ...safe } = user; res.json({ token, user: safe });
});

app.get("/api/me", verifyToken, async (req, res) => {
  const c = collections(); const user = await c.users.findOne({ _id: new ObjectId(req.user._id) });
  if (!user) return res.status(404).json({ message: "User not found" });
  const { passwordHash, ...safe } = user; res.json(safe);
});




app.get("/api/tuitions/:id", async (req, res) => {
  const c = collections(); let tuition;
  try { tuition = await c.tuitions.findOne({ _id: new ObjectId(req.params.id) }) } catch { }
  if (!tuition) return res.status(404).json({ message: "Tuition not found" });
  const tutor = await c.users.findOne({ email: tuition.tutorEmail }, { projection: { passwordHash: 0 } });
  res.json({ ...tuition, tutor });
});

app.post("/api/tuitions", verifyToken, verifyTutor, async (req, res) => {
  const c = collections();
  const tutor = await c.users.findOne({ _id: new ObjectId(req.user._id) });
  if (tutor?.plan === "free") {
    const count = await c.tuitions.countDocuments({ tutorEmail: tutor.email });
    if (count >= 2) return res.status(403).json({ message: "Free tutors can post up to 2 tuitions" });
  }
  const tuition = { ...req.body, tutorName: tutor.name, tutorEmail: tutor.email, approvalStatus: "pending", isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const result = await c.tuitions.insertOne(tuition); res.status(201).json({ ...tuition, _id: result.insertedId });
});

app.get("/api/dashboard/tutor/tuitions", verifyToken, verifyTutor, async (req, res) => {
  const c = collections(); const tutor = await c.users.findOne({ _id: new ObjectId(req.user._id) });
  res.json(await c.tuitions.find({ tutorEmail: tutor.email }).sort({ createdAt: -1 }).toArray());
});

app.patch("/api/tuitions/:id", verifyToken, async (req, res) => {
  const c = collections(); const filter = { _id: new ObjectId(req.params.id) };
  if (req.user.role === "tutor") { const tutor = await c.users.findOne({ _id: new ObjectId(req.user._id) }); filter.tutorEmail = tutor.email; }
  if (req.user.role === "student") return res.status(403).json({ message: "Forbidden" });
  if (req.body.approvalStatus && !["approved", "rejected", "pending"].includes(req.body.approvalStatus)) return res.status(400).json({ message: "Invalid approval status" });
  if (req.user.role === "tutor") delete req.body.approvalStatus;
  const result = await c.tuitions.updateOne(filter, { $set: { ...req.body, updatedAt: new Date() } });
  if (!result.matchedCount) return res.status(404).json({ message: "Tuition not found" });
  const updated = await c.tuitions.findOne(filter);
  res.json(updated);
});

app.delete("/api/tuitions/:id", verifyToken, async (req, res) => {
  const c = collections(); const filter = { _id: new ObjectId(req.params.id) };
  if (req.user.role === "tutor") { const tutor = await c.users.findOne({ _id: new ObjectId(req.user._id) }); filter.tutorEmail = tutor.email; }
  if (req.user.role === "student") return res.status(403).json({ message: "Forbidden" });
  const result = await c.tuitions.deleteOne(filter); if (!result.deletedCount) return res.status(404).json({ message: "Tuition not found" });
  await c.applications.deleteMany({ tuitionId: req.params.id }); res.json({ ok: true });
});

app.post("/api/applications", verifyToken, verifyStudent, async (req, res) => {
  const c = collections(); const { tuitionId, studentPhone, preferredSchedule, studentNote } = req.body;
  const tuition = await c.tuitions.findOne({ _id: new ObjectId(tuitionId), approvalStatus: "approved", isActive: true });
  if (!tuition) return res.status(404).json({ message: "Tuition not found" });
  const existing = await c.applications.findOne({ tuitionId, studentEmail: req.user.email });
  if (existing) return res.status(409).json({ message: "You already applied for this tuition" });
  const student = await c.users.findOne({ _id: new ObjectId(req.user._id) });
  const application = { tuitionId, tuitionTitle: tuition.title, subject: tuition.subject, monthlyFee: tuition.monthlyFee, tutorEmail: tuition.tutorEmail, studentName: student.name, studentEmail: student.email, studentPhone, preferredSchedule, studentNote, status: "pending", appliedAt: new Date() };
  const result = await c.applications.insertOne(application); res.status(201).json({ ...application, _id: result.insertedId });
});

app.get("/api/dashboard/student/applications", verifyToken, verifyStudent, async (req, res) => {
  const c = collections(); res.json(await c.applications.find({ studentEmail: req.user.email }).sort({ appliedAt: -1 }).toArray());
});

app.delete("/api/applications/:id", verifyToken, verifyStudent, async (req, res) => {
  const c = collections(); const result = await c.applications.findOne({ _id: new ObjectId(req.params.id), studentEmail: req.user.email, status: "pending" });
  if (!result) return res.status(404).json({ message: "Pending application not found" });
  await c.applications.deleteOne({ _id: result._id }); res.json({ ok: true });
});

app.get("/api/dashboard/tutor/applicants", verifyToken, verifyTutor, async (req, res) => {
  const c = collections(); const tutor = await c.users.findOne({ _id: new ObjectId(req.user._id) });
  res.json(await c.applications.find({ tutorEmail: tutor.email }).sort({ appliedAt: -1 }).toArray());
});

app.patch("/api/applications/:id/status", verifyToken, verifyTutor, async (req, res) => {
  const c = collections(); const tutor = await c.users.findOne({ _id: new ObjectId(req.user._id) });
  if (!["accepted", "rejected"].includes(req.body.status)) return res.status(400).json({ message: "Invalid status" });
  const filter = { _id: new ObjectId(req.params.id), tutorEmail: tutor.email };
  const result = await c.applications.updateOne(filter, { $set: { status: req.body.status }, $currentDate: { updatedAt: true } });
  if (!result.matchedCount) return res.status(404).json({ message: "Application not found" });
  const updated = await c.applications.findOne(filter);
  res.json(updated);
});

app.get("/api/dashboard/stats", verifyToken, async (req, res) => {
  const c = collections(); const user = await c.users.findOne({ _id: new ObjectId(req.user._id) });
  if (req.user.role === "student") {
    const all = await c.applications.find({ studentEmail: user.email }).toArray();
    return res.json({ total: all.length, accepted: all.filter(x => x.status === "accepted").length, pending: all.filter(x => x.status === "pending").length, plan: user.plan });
  }
  if (req.user.role === "tutor") {
    const tuitions = await c.tuitions.find({ tutorEmail: user.email }).toArray();
    const applicants = await c.applications.countDocuments({ tutorEmail: user.email });
    return res.json({ total: tuitions.length, active: tuitions.filter(x => x.isActive && x.approvalStatus === "approved").length, applicants, plan: user.plan });
  }
  const users = await c.users.countDocuments(), tutors = await c.users.countDocuments({ role: "tutor" }), pending = await c.tuitions.countDocuments({ approvalStatus: "pending" }), approved = await c.tuitions.countDocuments({ approvalStatus: "approved" });
  const paid = await c.payments.find({ paymentStatus: "paid" }).toArray();
  res.json({ users, tutors, pending, approved, revenue: paid.reduce((sum, p) => sum + (p.amount || 0), 0) });
});

app.patch("/api/profile", verifyToken, async (req, res) => {
  const c = collections(); const allowed = {};
  for (const key of ["name", "phone", "bio", "image"]) if (req.body[key] !== undefined) allowed[key] = req.body[key];
  allowed.updatedAt = new Date();
  const filter = { _id: new ObjectId(req.user._id) };
  const result = await c.users.updateOne(filter, { $set: allowed });
  if (!result.matchedCount) return res.status(404).json({ message: "User not found" });
  const user = await c.users.findOne(filter);
  const { passwordHash, ...safe } = user; res.json(safe);
});

// app.post("/api/upload/image", verifyToken, async (req, res) => {
//   if (!process.env.IMGBB_API_KEY?.trim()) return res.status(503).json({ message: "ImgBB API key is not configured" });
//   if (!req.body.image) return res.status(400).json({ message: "Image is required" });
//   if (req.body.image.length > 8_000_000) return res.status(413).json({ message: "Image is too large. Please upload a file smaller than 8 MB." });
//   try {
//     const form = new URLSearchParams();
//     form.append("key", process.env.IMGBB_API_KEY.trim());
//     form.append("image", req.body.image);
//     if (req.body.name) form.append("name", req.body.name);
//     const response = await axios.post("https://api.imgbb.com/1/upload", form, {
//       headers: { "Content-Type": "application/x-www-form-urlencoded" },
//       timeout: 30000,
//     });
//     if (!response.data?.success || !response.data?.data?.url) throw new Error("ImgBB returned no image URL");
//     res.json({ url: response.data.data.url });
//   } catch (error) {
//     const status = error?.response?.status;
//     const upstream = error?.response?.data?.error?.message || error?.response?.data?.status_txt || error?.message || "Unknown upload error";
//     console.error("ImgBB upload failed:", status || "", upstream);
//     res.status(status === 400 ? 400 : 502).json({ message: `Image upload failed: ${upstream}` });
//   }
// });

// app.post("/api/stripe/create-checkout", verifyToken, async (req, res) => {
//   if (!stripe) return res.status(503).json({ message: "Stripe is not configured" });
//   const c = collections(); const user = await c.users.findOne({ _id: new ObjectId(req.user._id) });
//   if (!user) return res.status(404).json({ message: "User not found" });
//   const amount = user.role === "tutor" ? 1500 : 1000;
//   try {
//     const session = await stripe.checkout.sessions.create({
//       mode: "payment",
//       line_items: [{
//         price_data: {
//           currency: "usd",
//           unit_amount: amount,
//           product_data: { name: `MentorLagbe Pro - ${user.role}` }
//         },
//         quantity: 1
//       }],
//       success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
//       metadata: { userId: user._id.toString(), role: user.role }
//     });
//     res.json({ url: session.url });
//   } catch (error) {
//     console.error("Stripe checkout failed:", error?.type || "", error?.code || "", error?.message || error);
//     res.status(500).json({
//       message: "Could not create checkout session",
//       detail: error?.message || "Stripe rejected the checkout request"
//     });
//   }
// });

// app.post("/api/stripe/verify", verifyToken, async (req, res) => {
//   if (!stripe || !req.body.sessionId) return res.status(400).json({ message: "Invalid session" });
//   try {
//     const session = await stripe.checkout.sessions.retrieve(req.body.sessionId);
//     if (session.payment_status !== "paid") return res.status(400).json({ message: "Payment not completed" });
//     const c = collections(); const userId = session.metadata.userId;
//     await c.users.updateOne({ _id: new ObjectId(userId) }, { $set: { plan: "pro", updatedAt: new Date() } });
//     const paidUser = await c.users.findOne({ _id: new ObjectId(userId) });
//     await c.payments.updateOne({ stripeSessionId: session.id }, { $set: { userEmail: paidUser?.email || session.customer_details?.email || "", userName: paidUser?.name || "", userRole: session.metadata.role || paidUser?.role || "", planName: "Pro", amount: (session.amount_total || 0) / 100, currency: session.currency, transactionId: session.payment_intent?.toString() || session.id, stripeSessionId: session.id, paymentStatus: "paid", paidAt: new Date() } }, { upsert: true });
//     res.json({ ok: true });
//   } catch (error) { res.status(400).json({ message: "Could not verify payment" }); }
// });

// app.get("/api/admin/users", verifyToken, verifyAdmin, async (req, res) => {
//   const c = collections(); const users = await c.users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).toArray(); res.json(users);
// });
// app.patch("/api/admin/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
//   if (!["student", "tutor", "admin"].includes(req.body.role)) return res.status(400).json({ message: "Invalid role" });
//   const c = collections(); await c.users.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { role: req.body.role, updatedAt: new Date() } }); res.json({ ok: true });
// });
// app.get("/api/admin/tuitions", verifyToken, verifyAdmin, async (req, res) => {
//   const c = collections(); res.json(await c.tuitions.find({}).sort({ createdAt: -1 }).toArray());
// });
// app.get("/api/admin/transactions", verifyToken, verifyAdmin, async (req, res) => {
//   const c = collections(); res.json(await c.payments.find({}).sort({ paidAt: -1 }).toArray());
// });

// connectDatabase().then(() => {
//   app.listen(PORT, () => console.log(`MentorLagbe API listening on port ${PORT}`));
// }).catch(error => { console.error(error.message); process.exit(1) });
