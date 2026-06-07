let idCounter = 0;

function createId() {
  idCounter += 1;
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${String(Date.now() + idCounter).padStart(12, "0").slice(-12)}`;
}

const SUPABASE_URL = "https://gutkkcorybzyiievocli.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dGtrY29yeWJ6eWlpZXZvY2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTI0MjksImV4cCI6MjA5NjMyODQyOX0.eMieGnmOli4eXw3celGIRLN2A4luV0ZWQVMKIHQJvYM";
let supabaseClient = null;
const adminAccount = {
  username: "dakshithu",
  email: "udakshith94@gmail.com",
  password: "dakshithu",
};

function isAdminUsername(username) {
  return username.toLowerCase() === adminAccount.username;
}

const guestUser = {
  username: "Guest",
  email: "",
  profilePictureUrl: "",
  role: "visitor",
  firstName: "",
  lastName: "",
  showFullName: false,
  isStudentCouncilMember: false,
  studentCouncilRow: "",
  specialNameDisplayEnabled: false,
};

const DEFAULT_QOTD = "What is one thing that would make school life easier this week?";

const state = {
  activeUser: { ...guestUser },
  isLoggedIn: false,
  filter: "all",
  searchQuery: "",
  openCommentsPostId: null,
  reports: [],
  posts: [],
  questionOfDay: {
    id: "",
    text: DEFAULT_QOTD,
    date: "",
  },
};

const feed = document.querySelector("#feed");
const signupDialog = document.querySelector("#signupDialog");
const loginDialog = document.querySelector("#loginDialog");
const forgotPasswordDialog = document.querySelector("#forgotPasswordDialog");
const cropDialog = document.querySelector("#cropDialog");
const toast = document.querySelector("#toast");
const openSignupButton = document.querySelector("#openSignup");
const openLoginButton = document.querySelector("#openLogin");
const logoutButton = document.querySelector("#logoutButton");
const cropCanvas = document.querySelector("#cropCanvas");
const cropContext = cropCanvas.getContext("2d");
const cropState = {
  image: null,
  target: "",
  signupDataUrl: "",
  profileDataUrl: "",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3600);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function openCropper(file, target) {
  if (!file) return;

  readImageFile(file).then((dataUrl) => {
    const image = new Image();
    image.onload = () => {
      cropState.image = image;
      cropState.target = target;
      document.querySelector("#cropZoom").value = "1";
      document.querySelector("#cropX").value = "0";
      document.querySelector("#cropY").value = "0";
      drawCropPreview();
      cropDialog.showModal();
    };
    image.src = dataUrl;
  }).catch(() => showToast("Could not read uploaded image."));
}

function drawCropPreview() {
  if (!cropState.image) return;

  const zoom = Number(document.querySelector("#cropZoom").value);
  const offsetX = Number(document.querySelector("#cropX").value);
  const offsetY = Number(document.querySelector("#cropY").value);
  const canvasSize = cropCanvas.width;
  const image = cropState.image;
  const baseScale = Math.max(canvasSize / image.width, canvasSize / image.height);
  const scale = baseScale * zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const maxOffsetX = Math.max(0, (drawWidth - canvasSize) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - canvasSize) / 2);
  const drawX = (canvasSize - drawWidth) / 2 + (offsetX / 100) * maxOffsetX;
  const drawY = (canvasSize - drawHeight) / 2 + (offsetY / 100) * maxOffsetY;

  cropContext.clearRect(0, 0, canvasSize, canvasSize);
  cropContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function usernameToEmail(username) {
  if (isAdminUsername(username)) {
    return adminAccount.email;
  }

  if (username.includes("@")) {
    return username;
  }

  return `${username.toLowerCase().replace(/[^a-z0-9._-]/g, "")}@aspam.local`;
}

function setActiveUser(profile) {
  state.activeUser = {
    username: profile.username,
    email: profile.email || "",
    profilePictureUrl: profile.profilePictureUrl || profile.profile_picture_url || "",
    role: profile.role,
    firstName: profile.firstName || profile.first_name || "",
    lastName: profile.lastName || profile.last_name || "",
    showFullName: Boolean(profile.showFullName ?? profile.show_full_name),
    isStudentCouncilMember: Boolean(profile.isStudentCouncilMember ?? profile.is_student_council_member),
    studentCouncilRow: profile.studentCouncilRow || profile.student_council_row || "",
    specialNameDisplayEnabled: Boolean(profile.specialNameDisplayEnabled ?? profile.special_name_display_enabled),
    isTeacherVerified: Boolean(profile.isTeacherVerified ?? profile.is_teacher_verified),
  };
  state.isLoggedIn = true;
  updateActiveUser();
  renderPosts();
}

function profileLine(post) {
  if (post.isAnonymous) return "Anonymous";

  const parts = [];
  const name = post.showFullName && post.firstName && post.lastName
    ? `${post.firstName} ${post.lastName}`
    : post.author;

  parts.push(name);

  if (post.council) {
    parts.push("Student Council Member");
  }

  if (post.special && post.row) {
    parts.push(post.row);
  }

  return parts.join(" | ");
}

function renderProfileFrame(initials, profilePictureUrl = "", small = false) {
  const sizeClass = small ? " small" : "";
  const content = profilePictureUrl
    ? `<img src="${escapeHtml(profilePictureUrl)}" alt="" />`
    : `<span>${escapeHtml(initials)}</span>`;

  return `<div class="profile-frame${sizeClass}" aria-hidden="true">${content}</div>`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function updateQuestionOfDayTitle() {
  document.querySelector("#qotdTitle").textContent = state.questionOfDay.text || DEFAULT_QOTD;
}

function canDeletePost(post) {
  if (!state.isLoggedIn) return false;
  if (state.activeUser.username === "dakshithu") return true;
  return !post.isAnonymous && post.author.toLowerCase() === state.activeUser.username.toLowerCase();
}

function teacherStatus(post) {
  if (post.role !== "teacher") return "";

  if (post.isTeacherVerified) {
    return `<span class="teacher-status verified">checkmark Verified Teacher</span>`;
  }

  return `<span class="teacher-status unverified">( ? Not Verified )</span>`;
}

function commentCount(post) {
  return post.comments.length;
}

function renderComments(post) {
  const comments = post.comments.length
    ? post.comments.map((comment) => `
      <div class="comment">
        <strong>${escapeHtml(comment.isAnonymous ? "Anonymous" : comment.author)} | ${escapeHtml(comment.role)}</strong>
        <p>${escapeHtml(comment.body)}</p>
      </div>
    `).join("")
    : `<p class="muted">No comments yet. Start the discussion.</p>`;

  return `
    <section class="comments-panel" id="comments-${post.id}" aria-label="Comments for ${escapeHtml(post.title)}">
      <div class="comment-list">${comments}</div>
      <form class="comment-form" data-comment-form="${post.id}">
        <label class="sr-only" for="comment-${post.id}">Add comment</label>
        <input id="comment-${post.id}" name="comment" required placeholder="Write a comment" />
        <button type="submit">Comment</button>
      </form>
    </section>
  `;
}

async function savePostToSupabase(post) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.from("posts").insert({
    id: post.id,
    author: post.author,
    role: post.role,
    initials: post.initials,
    title: post.title,
    body: post.body,
    visibility: post.visibility,
    profile_picture_url: post.profilePictureUrl,
    is_anonymous: post.isAnonymous,
    show_full_name: post.showFullName,
    first_name: post.firstName,
    last_name: post.lastName,
    council: post.council,
    row_label: post.row,
    special: post.special,
    is_teacher_verified: post.isTeacherVerified,
    score: post.score,
  });

  if (error) {
    showToast(`Supabase post save failed: ${error.message}`);
  }
}

async function saveProfileToSupabase(profile) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.from("profiles").upsert({
    username: profile.username,
    email: profile.email,
    profile_picture_url: profile.profilePictureUrl || "",
    role: profile.role,
    first_name: profile.firstName,
    last_name: profile.lastName,
    show_full_name: isAdminUsername(profile.username),
    is_student_council_member: isAdminUsername(profile.username),
    student_council_row: isAdminUsername(profile.username) ? "Grade 8B" : null,
    special_name_display_enabled: isAdminUsername(profile.username),
    is_teacher_verified: false,
  });

  if (error) {
    showToast(`Profile save failed: ${error.message}`);
    return;
  }

  await supabaseClient.auth.updateUser({
    data: {
      username: profile.username,
      role: profile.role,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profilePictureUrl: profile.profilePictureUrl || "",
      profile_picture_url: profile.profilePictureUrl || "",
    },
  });
}

async function updateProfilePictureInSupabase(username, profilePictureUrl) {
  if (!supabaseClient) return username;

  const profile = await getProfileFromSupabase(username)
    || (state.activeUser.email ? await getProfileByEmailFromSupabase(state.activeUser.email) : null);
  const persistedUsername = profile?.username || username;

  const { data: updatedProfile, error } = await supabaseClient
    .from("profiles")
    .update({ profile_picture_url: profilePictureUrl })
    .eq("username", persistedUsername)
    .select("username")
    .maybeSingle();

  if (error) {
    showToast(`Profile picture save failed: ${error.message}`);
    return false;
  }

  if (!updatedProfile) {
    const { error: insertError } = await supabaseClient.from("profiles").insert({
      username,
      email: state.activeUser.email,
      profile_picture_url: profilePictureUrl,
      role: state.activeUser.role,
      first_name: state.activeUser.firstName,
      last_name: state.activeUser.lastName,
      show_full_name: state.activeUser.showFullName,
      is_student_council_member: state.activeUser.isStudentCouncilMember,
      student_council_row: state.activeUser.studentCouncilRow || null,
      special_name_display_enabled: state.activeUser.specialNameDisplayEnabled,
      is_teacher_verified: state.activeUser.isTeacherVerified,
    });

    if (insertError) {
      showToast(`Profile picture save failed: ${insertError.message}`);
      return false;
    }
  }

  const { error: postsError } = await supabaseClient
    .from("posts")
    .update({ profile_picture_url: profilePictureUrl })
    .eq("author", persistedUsername)
    .eq("is_anonymous", false);

  if (postsError) {
    showToast(`Post profile pictures did not update: ${postsError.message}`);
  }

  await supabaseClient.auth.updateUser({
    data: {
      profilePictureUrl,
      profile_picture_url: profilePictureUrl,
    },
  });

  return persistedUsername;
}

async function getProfileFromSupabase(username) {
  if (!supabaseClient) return null;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    showToast(`Profile load failed: ${error.message}`);
    return null;
  }

  return data;
}

async function getProfileByEmailFromSupabase(email) {
  if (!supabaseClient) return null;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    showToast(`Profile load failed: ${error.message}`);
    return null;
  }

  return data;
}

async function saveCommentToSupabase(postId, comment) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.from("comments").insert({
    post_id: postId,
    author: comment.author,
    role: comment.role,
    body: comment.body,
    is_anonymous: comment.isAnonymous,
  });

  if (error) {
    showToast(`Supabase comment save failed: ${error.message}`);
  }
}

async function saveVerificationToSupabase() {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.from("verification_requests").insert({
    username: state.activeUser.username,
    message: "Please go Meet student Dakshith U of Grade 8B",
  });

  if (error) {
    showToast(`Verification save failed: ${error.message}`);
  }
}

async function saveReportToSupabase(report) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.from("reports").insert({
    id: report.id,
    post_id: report.postId,
    post_title: report.postTitle,
    post_author: report.postAuthor,
    reported_by: report.reportedBy,
    reason: report.reason,
    status: report.status,
  });

  if (error) {
    showToast(`Report save failed: ${error.message}`);
  }
}

async function updateReportStatus(reportId, status) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient
    .from("reports")
    .update({ status })
    .eq("id", reportId);

  if (error) {
    showToast(`Report update failed: ${error.message}`);
  }
}

async function loadQuestionOfDay() {
  const fallback = {
    id: "",
    text: DEFAULT_QOTD,
    date: todayIsoDate(),
  };

  if (!supabaseClient) {
    state.questionOfDay = fallback;
    updateQuestionOfDayTitle();
    return;
  }

  const today = todayIsoDate();
  const { data: todayQuestion, error: todayError } = await supabaseClient
    .from("questions_of_day")
    .select("*")
    .eq("question_date", today)
    .maybeSingle();

  if (todayError) {
    showToast(`Question of the Day load failed: ${todayError.message}`);
  }

  let question = todayQuestion;
  if (!question) {
    const { data: latestQuestions, error: latestError } = await supabaseClient
      .from("questions_of_day")
      .select("*")
      .order("question_date", { ascending: false })
      .limit(1);

    if (latestError) {
      showToast(`Question of the Day fallback failed: ${latestError.message}`);
    }

    question = latestQuestions?.[0] || null;
  }

  state.questionOfDay = question
    ? {
        id: question.id,
        text: question.question_text,
        date: question.question_date,
      }
    : fallback;

  updateQuestionOfDayTitle();
}

async function saveQuestionOfDay(questionText) {
  const trimmedQuestion = questionText.trim();
  if (!trimmedQuestion) return false;

  const question = {
    id: createId(),
    text: trimmedQuestion,
    date: todayIsoDate(),
  };

  state.questionOfDay = question;
  updateQuestionOfDayTitle();

  if (!supabaseClient) return true;

  const { data, error } = await supabaseClient
    .from("questions_of_day")
    .upsert({
      question_text: trimmedQuestion,
      question_date: question.date,
      created_by: state.activeUser.username,
    }, { onConflict: "question_date" })
    .select()
    .maybeSingle();

  if (error) {
    showToast(`Question of the Day save failed: ${error.message}`);
    return false;
  }

  if (data) {
    state.questionOfDay = {
      id: data.id,
      text: data.question_text,
      date: data.question_date,
    };
    updateQuestionOfDayTitle();
  }

  return true;
}

async function markPostRemoved(postId) {
  if (!supabaseClient) return true;

  const { error } = await supabaseClient
    .from("posts")
    .delete()
    .eq("id", postId);

  if (error) {
    showToast(`Post delete failed: ${error.message}`);
    return false;
  }

  return true;
}

async function grantStudentCouncil(username) {
  state.posts.forEach((post) => {
    if (post.author.toLowerCase() === username.toLowerCase()) {
      post.council = true;
      post.row = "Student Council";
      post.special = true;
    }
  });

  if (supabaseClient) {
    await supabaseClient
      .from("profiles")
      .update({
        is_student_council_member: true,
        student_council_row: "Student Council",
        special_name_display_enabled: true,
      })
      .eq("username", username);

    await supabaseClient
      .from("posts")
      .update({
        council: true,
        row_label: "Student Council",
        special: true,
      })
      .eq("author", username);
  }

  renderPosts();
}

async function markTeacherVerified(username) {
  state.posts.forEach((post) => {
    if (post.author.toLowerCase() === username.toLowerCase() && post.role === "teacher") {
      post.isTeacherVerified = true;
    }
  });

  if (state.activeUser.username.toLowerCase() === username.toLowerCase() && state.activeUser.role === "teacher") {
    state.activeUser.isTeacherVerified = true;
  }

  if (supabaseClient) {
    await supabaseClient
      .from("profiles")
      .update({ is_teacher_verified: true })
      .eq("username", username);

    await supabaseClient
      .from("posts")
      .update({ is_teacher_verified: true })
      .eq("author", username)
      .eq("role", "teacher");
  }

  renderPosts();
}

async function loadFromSupabase() {
  if (!supabaseClient) return;

  const { data: posts, error: postsError } = await supabaseClient
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (postsError) {
    showToast(`Supabase post load failed: ${postsError.message}`);
    return;
  }

  const { data: comments, error: commentsError } = await supabaseClient
    .from("comments")
    .select("*")
    .order("created_at", { ascending: true });

  if (commentsError) {
    showToast(`Supabase comment load failed: ${commentsError.message}`);
    return;
  }

  const { data: reports, error: reportsError } = await supabaseClient
    .from("reports")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (!reportsError) {
    state.reports = reports.map((report) => ({
      id: report.id,
      postId: report.post_id,
      postTitle: report.post_title,
      postAuthor: report.post_author,
      reportedBy: report.reported_by,
      reason: report.reason,
      status: report.status,
    }));
  }

  if (!posts.length) return;

  state.posts = posts.map((post) => ({
    id: post.id,
    author: post.author,
    role: post.role,
    initials: post.initials,
    profilePictureUrl: post.profile_picture_url || "",
    title: post.title,
    body: post.body,
    visibility: post.visibility,
    isAnonymous: post.is_anonymous,
    showFullName: post.show_full_name,
    firstName: post.first_name,
    lastName: post.last_name,
    council: post.council,
    row: post.row_label,
    special: post.special,
    isTeacherVerified: post.is_teacher_verified,
    status: post.status || "published",
    score: post.score,
    comments: comments
      .filter((comment) => comment.post_id === post.id)
      .map((comment) => ({
        id: comment.id,
        author: comment.author,
        role: comment.role,
        body: comment.body,
        isAnonymous: comment.is_anonymous,
      })),
  }));
}

async function setupSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.warn(`Supabase setup failed: ${error.message}`);
  }
}

async function restoreActiveSession() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session?.user) return;

  const user = data.session.user;
  const metadata = user.user_metadata || {};
  const profile = user.email
    ? await getProfileByEmailFromSupabase(user.email)
    : metadata.username
      ? await getProfileFromSupabase(metadata.username)
      : null;

  if (profile) {
    setActiveUser(profile);
    return;
  }

  if (metadata.username || user.email) {
    setActiveUser({
      username: metadata.username || user.email.split("@")[0],
      email: user.email || "",
      profilePictureUrl: metadata.profilePictureUrl || metadata.profile_picture_url || "",
      role: isAdminUsername(metadata.username || "") ? "admin" : metadata.role || "student",
      firstName: metadata.firstName || metadata.first_name || "",
      lastName: metadata.lastName || metadata.last_name || "",
      showFullName: isAdminUsername(metadata.username || ""),
      isStudentCouncilMember: isAdminUsername(metadata.username || ""),
      studentCouncilRow: isAdminUsername(metadata.username || "") ? "Grade 8B" : "",
      specialNameDisplayEnabled: isAdminUsername(metadata.username || ""),
      isTeacherVerified: false,
    });
  }
}

function renderPosts() {
  const query = state.searchQuery.trim().toLowerCase();
  const filtered = state.posts.filter((post) => {
    if (post.status === "removed") return false;
    if (state.filter === "all") return true;
    if (state.filter === "teacher") return post.role === "teacher";
    if (state.filter === "anonymous") return post.isAnonymous;
    return true;
  }).filter((post) => {
    if (!query) return true;

    return [
      post.title,
      post.body,
      post.author,
      post.role,
      post.visibility,
      profileLine(post),
    ].some((value) => String(value).toLowerCase().includes(query));
  });

  if (!filtered.length) {
    const hasFilters = state.searchQuery.trim() || state.filter !== "all";
    feed.innerHTML = hasFilters
      ? `<article class="post-card empty-feed"><h3>No posts found</h3><p class="post-body">Try another search or filter.</p></article>`
      : `<article class="post-card empty-feed"><h3>No posts yet</h3><p class="post-body">Create the first AspamHub post.</p></article>`;
    return;
  }

  feed.innerHTML = filtered.map((post) => `
    <article class="post-card ${state.openCommentsPostId === post.id ? "comments-open" : ""}" data-role="${escapeHtml(post.role)}" data-anonymous="${post.isAnonymous}">
      <header>
        ${renderProfileFrame(post.initials, post.profilePictureUrl)}
        <div>
          <div class="post-meta">
            <strong>${escapeHtml(profileLine(post))}</strong>
            <span>|</span>
            <span>${post.role === "teacher" ? "Teacher" : escapeHtml(post.role)}</span>
            ${teacherStatus(post)}
            <span>|</span>
            <span>${escapeHtml(post.visibility)}</span>
          </div>
          <div class="post-meta">
            <span>${post.isAnonymous ? "Anonymous posting option enabled" : "Name display visible"}</span>
          </div>
        </div>
        <span class="tag">${escapeHtml(post.isAnonymous ? "Anonymous" : post.role)}</span>
      </header>
      <h3>${escapeHtml(post.title)}</h3>
      <p class="post-body">${escapeHtml(post.body)}</p>
      <div class="post-actions" aria-label="Post actions">
        <button type="button" data-vote="${post.id}">Upvote ${post.score}</button>
        <button type="button" data-comments="${post.id}" aria-expanded="${state.openCommentsPostId === post.id}" aria-controls="comments-${post.id}">
          ${commentCount(post)} comments
        </button>
        <button type="button" data-report="${post.id}">Report</button>
        ${canDeletePost(post) ? `<button type="button" data-delete-post="${post.id}">Delete for everybody</button>` : ""}
      </div>
      ${renderComments(post)}
    </article>
  `).join("");
}

function renderModerationQueue() {
  const moderationQueue = document.querySelector("#moderationQueue");
  if (!moderationQueue) return;

  const openReports = state.reports.filter((report) => report.status === "open");
  if (!openReports.length) {
    moderationQueue.innerHTML = `<p class="muted">No reported posts.</p>`;
    return;
  }

  moderationQueue.innerHTML = openReports.map((report) => `
    <article class="moderation-item">
      <strong>${escapeHtml(report.postTitle)}</strong>
      <p>By ${escapeHtml(report.postAuthor)} | Reported by ${escapeHtml(report.reportedBy)}</p>
      <p>${escapeHtml(report.reason)}</p>
      <div>
        <button type="button" data-dismiss-report="${report.id}">Dismiss</button>
        <button type="button" data-remove-report="${report.id}">Remove post</button>
      </div>
    </article>
  `).join("");
}

function updateActiveUser() {
  document.querySelector("#activeUserName").textContent = state.activeUser.username;
  document.querySelector("#activeUserRole").textContent = state.activeUser.role;
  document.querySelector(".current-user").querySelector(".profile-frame").outerHTML =
    renderProfileFrame(state.activeUser.username.charAt(0).toUpperCase(), state.activeUser.profilePictureUrl, true);
  document.querySelector("#profilePictureUrl").value = state.activeUser.profilePictureUrl || "";
  const permission = document.querySelector("#postingPermission");
  permission.textContent = !state.isLoggedIn
    ? "Create an account to post."
    : state.activeUser.role === "student"
    ? "Student posting needs configured permission. Anonymous demo remains available."
    : `${state.activeUser.role[0].toUpperCase()}${state.activeUser.role.slice(1)} can post.`;
  openSignupButton.classList.toggle("hidden", state.isLoggedIn);
  openLoginButton.classList.toggle("hidden", state.isLoggedIn);
  logoutButton.classList.toggle("hidden", !state.isLoggedIn);
  document.querySelectorAll(".admin-only, #admin, #adminNavLink").forEach((element) => {
    element.classList.toggle("admin-hidden", state.activeUser.username !== "dakshithu");
  });
  renderModerationQueue();
}

document.querySelector("#themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "" : "dark";
  document.documentElement.dataset.theme = next;
  showToast(next ? "Dark mode enabled." : "Light mode enabled.");
});

openSignupButton.addEventListener("click", () => signupDialog.showModal());
openLoginButton.addEventListener("click", () => loginDialog.showModal());

document.querySelector("#forgotPasswordButton").addEventListener("click", () => {
  const usernameOrEmail = document.querySelector("#loginUsername").value.trim();
  if (usernameOrEmail.includes("@")) {
    document.querySelector("#resetEmail").value = usernameOrEmail;
  } else if (isAdminUsername(usernameOrEmail)) {
    document.querySelector("#resetEmail").value = adminAccount.email;
  }

  loginDialog.close();
  forgotPasswordDialog.showModal();
});

document.querySelectorAll(".close-button").forEach((button) => {
  button.addEventListener("click", () => {
    button.closest("dialog").close();
  });
});

["cropZoom", "cropX", "cropY"].forEach((id) => {
  document.querySelector(`#${id}`).addEventListener("input", drawCropPreview);
});

document.querySelector("#signupProfilePictureUpload").addEventListener("change", (event) => {
  openCropper(event.target.files[0], "signup");
});

document.querySelector("#profilePictureUpload").addEventListener("change", (event) => {
  openCropper(event.target.files[0], "profile");
});

document.querySelector("#cropForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const croppedDataUrl = cropCanvas.toDataURL("image/png");

  if (cropState.target === "signup") {
    cropState.signupDataUrl = croppedDataUrl;
    document.querySelector("#signupProfilePicture").value = "";
    showToast("Cropped signup image ready.");
  }

  if (cropState.target === "profile") {
    cropState.profileDataUrl = croppedDataUrl;
    document.querySelector("#profilePictureUrl").value = "";
    showToast("Cropped profile image ready. Click Save upload.");
  }

  cropDialog.close();
});

logoutButton.addEventListener("click", async () => {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }

  state.activeUser = { ...guestUser };
  state.isLoggedIn = false;
  updateActiveUser();
  renderPosts();
  showToast("Logged out.");
});

document.querySelector("#startPosting").addEventListener("click", () => {
  document.querySelector("#postTitle").focus();
});

document.querySelector("#teacherVerifyShortcut").addEventListener("click", () => {
  document.querySelector("#verifyTeacher").click();
});

document.querySelector("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const role = new FormData(event.currentTarget).get("role");
  const username = document.querySelector("#signupUsername").value.trim() || "new-user";
  const emailInput = document.querySelector("#signupEmail").value.trim();
  const password = document.querySelector("#signupPassword").value;
  const profilePictureUrl = cropState.signupDataUrl || document.querySelector("#signupProfilePicture").value.trim();
  const firstName = document.querySelector("#firstName").value.trim();
  const lastName = document.querySelector("#lastName").value.trim();
  const normalizedRole = isAdminUsername(username) ? "admin" : role;
  const email = isAdminUsername(username) ? adminAccount.email : emailInput;

  if (password.length < 6) {
    showToast("Password must be at least 6 characters.");
    return;
  }

  if (supabaseClient) {
    const { error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          role: normalizedRole,
          firstName,
          lastName,
          first_name: firstName,
          last_name: lastName,
          profilePictureUrl,
          profile_picture_url: profilePictureUrl,
        },
      },
    });

    if (authError) {
      showToast(`Account creation failed: ${authError.message}`);
      return;
    }

    await saveProfileToSupabase({ username, email, profilePictureUrl, role: normalizedRole, firstName, lastName });
  }

  setActiveUser({
    username,
    email,
    profilePictureUrl,
    role: normalizedRole,
    firstName,
    lastName,
    showFullName: isAdminUsername(username),
    isStudentCouncilMember: isAdminUsername(username),
    studentCouncilRow: isAdminUsername(username) ? "Grade 8B" : "",
    specialNameDisplayEnabled: isAdminUsername(username),
    isTeacherVerified: false,
  });

  signupDialog.close();
  event.currentTarget.reset();
  cropState.signupDataUrl = "";

  if (normalizedRole === "teacher") {
    showToast("Teacher account created. Teachers can post. Verification option is available.");
  } else {
    showToast(`${normalizedRole[0].toUpperCase()}${normalizedRole.slice(1)} account created.`);
  }
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const usernameOrEmail = document.querySelector("#loginUsername").value.trim();
  const password = document.querySelector("#loginPassword").value;
  const email = usernameToEmail(usernameOrEmail);

  if (password.length < 6) {
    showToast("Password must be at least 6 characters.");
    return;
  }

  if (supabaseClient) {
    const { error: authError } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      showToast(`Login failed: ${authError.message}`);
      return;
    }

    const profile = usernameOrEmail.includes("@")
      ? await getProfileByEmailFromSupabase(email)
      : await getProfileFromSupabase(usernameOrEmail);

    if (profile) {
      setActiveUser(profile);
    } else {
      const { data: userData } = await supabaseClient.auth.getUser();
      const metadata = userData.user?.user_metadata || {};
      setActiveUser({
        username: metadata.username || (usernameOrEmail.includes("@") ? email.split("@")[0] : usernameOrEmail),
        email,
        profilePictureUrl: metadata.profilePictureUrl || metadata.profile_picture_url || "",
        role: isAdminUsername(usernameOrEmail) ? "admin" : metadata.role || "student",
        firstName: metadata.firstName || "",
        lastName: metadata.lastName || "",
        showFullName: isAdminUsername(usernameOrEmail),
        isStudentCouncilMember: isAdminUsername(usernameOrEmail),
        studentCouncilRow: isAdminUsername(usernameOrEmail) ? "Grade 8B" : "",
        specialNameDisplayEnabled: isAdminUsername(usernameOrEmail),
        isTeacherVerified: false,
      });
    }
  } else {
    setActiveUser({
      username: usernameOrEmail.includes("@") ? email.split("@")[0] : usernameOrEmail,
      email,
      profilePictureUrl: "",
      role: isAdminUsername(usernameOrEmail) ? "admin" : "student",
      firstName: "",
      lastName: "",
      showFullName: isAdminUsername(usernameOrEmail),
      isStudentCouncilMember: isAdminUsername(usernameOrEmail),
      studentCouncilRow: isAdminUsername(usernameOrEmail) ? "Grade 8B" : "",
      specialNameDisplayEnabled: isAdminUsername(usernameOrEmail),
      isTeacherVerified: false,
    });
  }

  loginDialog.close();
  event.currentTarget.reset();
  showToast("Logged in.");
});

document.querySelector("#forgotPasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#resetEmail").value.trim();

  if (!supabaseClient) {
    showToast("Password reset needs Supabase to be connected.");
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href,
  });

  if (error) {
    showToast(`Reset email failed: ${error.message}`);
    return;
  }

  forgotPasswordDialog.close();
  event.currentTarget.reset();
  showToast("Password reset email sent.");
});

document.querySelector("#postComposer").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.isLoggedIn) {
    showToast("Please create an account before posting.");
    signupDialog.showModal();
    return;
  }

  const canPost = ["teacher", "admin"].includes(state.activeUser.role);
  const anonymous = document.querySelector("#anonymousToggle").checked;

  if (!canPost && !anonymous) {
    showToast("Student posting permission is not configured. Turn on anonymous posting for this demo.");
    return;
  }

  const title = document.querySelector("#postTitle").value.trim();
  const body = document.querySelector("#postBody").value.trim();
  const visibility = document.querySelector("#postVisibility").value;

  const newPost = {
    id: createId(),
    author: anonymous ? "Anonymous" : state.activeUser.username,
    role: state.activeUser.role,
    initials: anonymous ? "?" : state.activeUser.username.charAt(0).toUpperCase(),
    profilePictureUrl: anonymous ? "" : state.activeUser.profilePictureUrl,
    title,
    body,
    visibility,
    isAnonymous: anonymous,
    showFullName: state.activeUser.showFullName,
    firstName: state.activeUser.firstName,
    lastName: state.activeUser.lastName,
    council: state.activeUser.isStudentCouncilMember,
    row: state.activeUser.studentCouncilRow,
    special: state.activeUser.specialNameDisplayEnabled,
    isTeacherVerified: state.activeUser.isTeacherVerified,
    score: 1,
    comments: [],
  };

  state.posts.unshift(newPost);
  await savePostToSupabase(newPost);

  event.currentTarget.reset();
  renderPosts();
  showToast("Post published to the forum feed.");
});

document.querySelector("#qotdForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.isLoggedIn) {
    showToast("Please create an account before answering.");
    signupDialog.showModal();
    return;
  }

  const answer = document.querySelector("#qotdAnswer").value.trim();
  if (!answer) return;

  const newPost = {
    id: createId(),
    author: state.activeUser.username,
    role: state.activeUser.role,
    initials: state.activeUser.username.charAt(0).toUpperCase(),
    profilePictureUrl: state.activeUser.profilePictureUrl,
    title: `Question of the Day: ${state.questionOfDay.text}`,
    body: answer,
    visibility: "Whole school",
    isAnonymous: false,
    showFullName: state.activeUser.showFullName,
    firstName: state.activeUser.firstName,
    lastName: state.activeUser.lastName,
    council: state.activeUser.isStudentCouncilMember,
    row: state.activeUser.studentCouncilRow,
    special: state.activeUser.specialNameDisplayEnabled,
    isTeacherVerified: state.activeUser.isTeacherVerified,
    score: 1,
    comments: [],
  };

  state.posts.unshift(newPost);
  await savePostToSupabase(newPost);
  event.currentTarget.reset();
  renderPosts();
  showToast("Your Question of the Day answer was posted.");
});

document.querySelector("#verifyTeacher").addEventListener("click", async () => {
  if (!state.isLoggedIn) {
    showToast("Please create a teacher account first.");
    signupDialog.showModal();
    return;
  }

  if (state.activeUser.role !== "teacher") {
    showToast("Only teacher accounts can request teacher verification.");
    return;
  }

  const status = document.querySelector("#verificationStatus");
  status.textContent = "Please go Meet student Dakshith U of Grade 8B";
  await saveVerificationToSupabase();
  showToast("Please go Meet student Dakshith U of Grade 8B");
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    state.filter = button.dataset.filter;
    renderPosts();
  });
});

document.querySelector("#feedSearch").addEventListener("input", (event) => {
  state.searchQuery = event.target.value;
  renderPosts();
});

document.querySelector("#profilePictureForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.isLoggedIn) {
    showToast("Please log in before changing your profile picture.");
    loginDialog.showModal();
    return;
  }

  const uploadInput = document.querySelector("#profilePictureUpload");
  let profilePictureUrl = cropState.profileDataUrl || document.querySelector("#profilePictureUrl").value.trim();
  if (!profilePictureUrl && uploadInput.files[0]) {
    profilePictureUrl = await readImageFile(uploadInput.files[0]);
  }

  if (!profilePictureUrl) {
    showToast("Choose an image or enter an image URL first.");
    return;
  }

  const persistedUsername = await updateProfilePictureInSupabase(state.activeUser.username, profilePictureUrl);
  if (!persistedUsername) return;

  state.activeUser.username = persistedUsername;
  state.activeUser.profilePictureUrl = profilePictureUrl;
  document.querySelector("#profilePictureUrl").value = profilePictureUrl.startsWith("data:")
    ? ""
    : profilePictureUrl;
  uploadInput.value = "";
  cropState.profileDataUrl = "";

  state.posts.forEach((post) => {
    if (!post.isAnonymous && post.author === persistedUsername) {
      post.profilePictureUrl = profilePictureUrl;
    }
  });

  updateActiveUser();
  renderPosts();
  showToast("Profile picture updated.");
});

document.querySelectorAll("[data-admin-action]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.activeUser.username !== "dakshithu") {
      showToast("Only admin dakshithu can use this control.");
      return;
    }

    const actions = {
      studentCouncil: "Assigned optional Student Council Member tag and member row.",
      specialName: "Enabled optional name, first name and last name display with pipe specialty behavior.",
    };

    document.querySelector("#adminLog").innerHTML = `<p>${actions[button.dataset.adminAction]}</p>`;
    showToast("Admin action completed by dakshithu.");
  });
});

document.querySelector("#studentCouncilForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.activeUser.username !== "dakshithu") {
    showToast("Only admin dakshithu can use this control.");
    return;
  }

  const username = document.querySelector("#studentCouncilUsername").value.trim();
  await grantStudentCouncil(username);
  document.querySelector("#adminLog").innerHTML = `<p>Assigned Student Council Member to ${escapeHtml(username)}.</p>`;
  event.currentTarget.reset();
  showToast(`Student Council Member given to ${username}.`);
});

document.querySelector("#teacherVerifyAdminForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.activeUser.username !== "dakshithu") {
    showToast("Only admin dakshithu can use this control.");
    return;
  }

  const username = document.querySelector("#teacherVerifyUsername").value.trim();
  await markTeacherVerified(username);
  document.querySelector("#adminLog").innerHTML = `<p>Marked ${escapeHtml(username)} as Verified Teacher.</p>`;
  event.currentTarget.reset();
  showToast(`${username} is now a verified teacher.`);
});

document.querySelector("#qotdAdminForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.activeUser.username !== "dakshithu") {
    showToast("Only admin dakshithu can change the Question of the Day.");
    return;
  }

  const input = document.querySelector("#qotdAdminQuestion");
  const question = input.value.trim();
  const saved = await saveQuestionOfDay(question);

  if (!saved) return;

  document.querySelector("#adminLog").innerHTML =
    `<p>Question of the Day changed to: ${escapeHtml(question)}</p>`;
  event.currentTarget.reset();
  showToast("Question of the Day updated.");
});

feed.addEventListener("click", async (event) => {
  const voteButton = event.target.closest("[data-vote]");
  const reportButton = event.target.closest("[data-report]");
  const commentsButton = event.target.closest("[data-comments]");
  const deleteButton = event.target.closest("[data-delete-post]");

  if (voteButton) {
    const post = state.posts.find((item) => item.id === voteButton.dataset.vote);
    post.score += 1;
    renderPosts();
  }

  if (reportButton) {
    const post = state.posts.find((item) => item.id === reportButton.dataset.report);
    if (!post) return;

    const alreadyReported = state.reports.some(
      (report) => report.postId === post.id && report.status === "open",
    );

    if (alreadyReported) {
      showToast("This post is already in the moderation queue.");
      return;
    }

    const report = {
      id: createId(),
      postId: post.id,
      postTitle: post.title,
      postAuthor: post.author,
      reportedBy: state.isLoggedIn ? state.activeUser.username : "Guest",
      reason: "Reported from forum feed",
      status: "open",
    };

    state.reports.unshift(report);
    await saveReportToSupabase(report);
    renderModerationQueue();
    showToast("Post sent to moderation queue.");
  }

  if (deleteButton) {
    const post = state.posts.find((item) => item.id === deleteButton.dataset.deletePost);
    if (!post) return;

    if (!canDeletePost(post)) {
      showToast("You do not have permission to delete this post.");
      return;
    }

    const confirmed = window.confirm("Delete this post for everybody?");
    if (!confirmed) return;

    const deleted = await markPostRemoved(post.id);
    if (!deleted) return;

    state.posts = state.posts.filter((item) => item.id !== post.id);
    renderPosts();
    showToast("Post deleted for everybody.");
  }

  if (commentsButton) {
    state.openCommentsPostId = state.openCommentsPostId === commentsButton.dataset.comments
      ? null
      : commentsButton.dataset.comments;
    renderPosts();
  }
});

document.querySelector("#moderationQueue").addEventListener("click", async (event) => {
  const dismissButton = event.target.closest("[data-dismiss-report]");
  const removeButton = event.target.closest("[data-remove-report]");

  if (!dismissButton && !removeButton) return;

  if (state.activeUser.username !== "dakshithu") {
    showToast("Only admin dakshithu can moderate posts.");
    return;
  }

  const reportId = dismissButton?.dataset.dismissReport || removeButton?.dataset.removeReport;
  const report = state.reports.find((item) => item.id === reportId);
  if (!report) return;

  if (dismissButton) {
    report.status = "dismissed";
    await updateReportStatus(reportId, "dismissed");
    showToast("Report dismissed.");
  }

  if (removeButton) {
    report.status = "removed";
    await updateReportStatus(reportId, "removed");
    const deleted = await markPostRemoved(report.postId);
    if (!deleted) return;

    state.posts = state.posts.filter((post) => post.id !== report.postId);
    renderPosts();
    showToast("Post removed from feed.");
  }

  renderModerationQueue();
});

feed.addEventListener("submit", async (event) => {
  const commentForm = event.target.closest("[data-comment-form]");
  if (!commentForm) return;

  event.preventDefault();
  const postId = commentForm.dataset.commentForm;
  const post = state.posts.find((item) => item.id === postId);
  const input = commentForm.elements.comment;
  const body = input.value.trim();

  if (!post || !body) return;

  const comment = {
    id: createId(),
    author: state.activeUser.username,
    role: state.activeUser.role,
    body,
    isAnonymous: false,
  };

  post.comments.push(comment);
  await saveCommentToSupabase(postId, comment);
  input.value = "";
  state.openCommentsPostId = postId;
  renderPosts();
  showToast("Comment added.");
});

async function initializeApp() {
  updateActiveUser();
  await setupSupabase();
  await restoreActiveSession();
  await loadQuestionOfDay();
  await loadFromSupabase();
  renderPosts();
  renderModerationQueue();
}

initializeApp();
