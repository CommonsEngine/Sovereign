(() => {
  const modal = document.querySelector('[data-modal="account-settings"]');
  if (!modal) return;

  const parseConfig = (value) => {
    try {
      return JSON.parse(value || "{}");
    } catch {
      return {};
    }
  };

  const config = {
    passwordMinLength: 8,
    timezoneDefault: "UTC",
    profilePictureMaxBytes: 0,
    ...parseConfig(modal.dataset.accountSettings),
  };

  const firstNameInput = modal.querySelector("#account-first-name");
  const lastNameInput = modal.querySelector("#account-last-name");
  const localeInput = modal.querySelector("[data-account-locale]");
  const timezoneSelect = modal.querySelector("[data-account-timezone]");

  const basicForm = modal.querySelector("[data-account-basic-form]");
  const basicError = modal.querySelector('[data-account-alert="basic-error"]');
  const basicSuccess = modal.querySelector('[data-account-alert="basic-success"]');

  const passwordForm = modal.querySelector("[data-account-password-form]");
  const currentPasswordInput = modal.querySelector("#account-current-password");
  const newPasswordInput = modal.querySelector("#account-new-password");
  const confirmPasswordInput = modal.querySelector("#account-confirm-password");
  const passwordError = modal.querySelector('[data-account-alert="password-error"]');
  const passwordSuccess = modal.querySelector('[data-account-alert="password-success"]');
  const passwordHint = modal.querySelector("[data-account-password-hint]");

  const picturePreview = modal.querySelector("[data-account-picture-preview]");
  const pictureImage = picturePreview?.querySelector("img");
  const pictureUploadButton = modal.querySelector("[data-account-upload-button]");
  const pictureFileInput = modal.querySelector("[data-account-picture-input]");
  const pictureError = modal.querySelector('[data-account-alert="picture-error"]');
  const pictureSuccess = modal.querySelector('[data-account-alert="picture-success"]');
  const pictureHint = modal.querySelector("[data-account-upload-hint]");

  const headerName = document.querySelector(".sv-header__user-greeting strong");
  const headerAvatar = document.querySelector(".sv-header__user-avatar");
  const headerAvatarImg = headerAvatar?.querySelector("[data-header-avatar-img]");

  const fallbackTimezones = [
    "UTC",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
  ];

  let userCache = null;
  let loadingUser = null;

  const formatBytes = (bytes) => {
    if (!bytes || Number.isNaN(Number(bytes))) return "";
    const units = ["B", "KB", "MB", "GB"];
    let idx = 0;
    let value = Number(bytes);
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${parseFloat(value.toFixed(1))}${units[idx]}`;
  };

  const showAlert = (el, message) => {
    if (!el) return;
    if (!message) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.textContent = message;
    el.style.display = "block";
  };

  const parseJson = async (res) => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  const syncHeader = (user) => {
    if (!user) return;
    if (headerName && user.name) {
      headerName.textContent = user.name;
    }
    if (headerAvatar) {
      if (user.name) {
        headerAvatar.setAttribute("title", user.name);
      } else {
        headerAvatar.removeAttribute("title");
      }
      if (user.pictureUrl) {
        headerAvatar.dataset.hasAvatar = "true";
        if (headerAvatarImg) {
          headerAvatarImg.src = user.pictureUrl;
        }
      } else {
        headerAvatar.dataset.hasAvatar = "false";
        headerAvatarImg?.removeAttribute("src");
      }
    }
  };

  const setPicturePreview = (url) => {
    if (!picturePreview || !pictureImage) return;
    if (url) {
      picturePreview.dataset.pictureLoaded = "true";
      pictureImage.src = url;
    } else {
      picturePreview.dataset.pictureLoaded = "false";
      pictureImage.removeAttribute("src");
    }
  };

  const populateTimezones = () => {
    if (!timezoneSelect) return;
    const values =
      typeof Intl === "object" && typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : fallbackTimezones;
    timezoneSelect.innerHTML = '<option value="">Use workspace default</option>';
    const fragment = document.createDocumentFragment();
    values.forEach((zone) => {
      const option = document.createElement("option");
      option.value = zone;
      option.textContent = zone;
      fragment.appendChild(option);
    });
    timezoneSelect.appendChild(fragment);
  };

  const applyUserData = (user) => {
    if (!user) return;
    userCache = user;
    if (firstNameInput) firstNameInput.value = user.firstName || "";
    if (lastNameInput) lastNameInput.value = user.lastName || "";
    if (localeInput) localeInput.value = user.locale || "";
    if (timezoneSelect) {
      const presentValue = user.timezone || config.timezoneDefault || "";
      timezoneSelect.value = presentValue;
    }
    setPicturePreview(user.pictureUrl);
    syncHeader(user);
  };

  const loadUser = () => {
    if (loadingUser) return loadingUser;
    loadingUser = fetch("/api/account")
      .then(async (res) => {
        const payload = await parseJson(res);
        if (!res.ok) {
          throw new Error(payload?.error || "Unable to load account");
        }
        return payload?.user || null;
      })
      .catch((error) => {
        throw error;
      })
      .finally(() => {
        loadingUser = null;
      });
    return loadingUser;
  };

  const handleModalOpen = () => {
    loadUser()
      .then((user) => {
        applyUserData(user);
      })
      .catch((error) => {
        showAlert(basicError, error?.message || "Failed to load account info.");
      });
  };

  const submitBasic = async (event) => {
    event.preventDefault();
    showAlert(basicError, "");
    showAlert(basicSuccess, "");
    if (!basicForm) return;
    const payload = {
      firstName: firstNameInput?.value ?? "",
      lastName: lastNameInput?.value ?? "",
      locale: localeInput?.value ?? "",
      timezone: timezoneSelect?.value ?? "",
    };
    basicForm.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update profile.");
      }
      showAlert(basicSuccess, "Profile updated.");
      applyUserData(data?.user);
    } catch (error) {
      showAlert(basicError, error?.message || "Failed to update profile.");
    } finally {
      basicForm.querySelectorAll("button").forEach((btn) => (btn.disabled = false));
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    showAlert(passwordError, "");
    showAlert(passwordSuccess, "");
    if (!passwordForm) return;
    const payload = {
      currentPassword: currentPasswordInput?.value ?? "",
      newPassword: newPasswordInput?.value ?? "",
      confirmPassword: confirmPasswordInput?.value ?? "",
    };
    passwordForm.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        throw new Error(data?.error || "Password update failed.");
      }
      showAlert(passwordSuccess, "Password updated.");
      currentPasswordInput && (currentPasswordInput.value = "");
      newPasswordInput && (newPasswordInput.value = "");
      confirmPasswordInput && (confirmPasswordInput.value = "");
    } catch (error) {
      showAlert(passwordError, error?.message || "Password update failed.");
    } finally {
      passwordForm.querySelectorAll("button").forEach((btn) => (btn.disabled = false));
    }
  };

  const uploadPicture = async (file) => {
    if (!pictureFileInput || !pictureUploadButton) return;
    if (!file) return;
    showAlert(pictureError, "");
    showAlert(pictureSuccess, "");
    pictureUploadButton.disabled = true;
    pictureFileInput.disabled = true;
    const formData = new FormData();
    formData.append("picture", file);
    try {
      const res = await fetch("/api/account/picture", {
        method: "POST",
        body: formData,
      });
      const data = await parseJson(res);
      if (!res.ok) {
        throw new Error(data?.error || "Upload failed.");
      }
      showAlert(pictureSuccess, "Profile picture updated.");
      applyUserData(data?.user);
      pictureFileInput.value = "";
    } catch (error) {
      showAlert(pictureError, error?.message || "Upload failed.");
    } finally {
      pictureUploadButton.disabled = false;
      pictureFileInput.disabled = false;
    }
  };

  if (pictureHint && config.profilePictureMaxBytes) {
    pictureHint.textContent = `Max ${formatBytes(config.profilePictureMaxBytes)} file size.`;
  }

  if (passwordHint) {
    passwordHint.textContent = `Minimum ${config.passwordMinLength ?? 0} characters.`;
  }

  populateTimezones();

  if (pictureUploadButton && pictureFileInput) {
    pictureUploadButton.addEventListener("click", () => {
      pictureFileInput.value = "";
      pictureFileInput.click();
    });
    pictureFileInput.addEventListener("change", () => {
      const file = pictureFileInput.files?.[0];
      uploadPicture(file);
    });
  }

  basicForm?.addEventListener("submit", submitBasic);
  passwordForm?.addEventListener("submit", submitPassword);

  const observer = new MutationObserver(() => {
    if (modal.dataset.modalActive === "true") {
      handleModalOpen();
    }
  });
  observer.observe(modal, { attributes: true });

  // ensure we pull data once in case the modal is already open
  if (modal.dataset.modalActive === "true") {
    handleModalOpen();
  }
})();
