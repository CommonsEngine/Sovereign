const pingButton = document.querySelector("#ping");
const result = document.querySelector("#result");

pingButton?.addEventListener("click", () => {
  if (!result) {
    return;
  }

  result.value = `Iframe runtime active at ${new Date().toLocaleTimeString()}`;
});
