const pingButton = document.querySelector("#ping");
const result = document.querySelector("#result");
const route = document.querySelector("#route");
const routeButtons = document.querySelectorAll("[data-route]");

let currentRoute =
  new URLSearchParams(window.location.search).get("sovereignPath") || "/";

renderRoute(currentRoute);

routeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextRoute = button.getAttribute("data-route");

    if (!nextRoute) {
      return;
    }

    navigate(nextRoute);
  });
});

pingButton?.addEventListener("click", () => {
  if (!result) {
    return;
  }

  result.value = `Iframe runtime active at ${new Date().toLocaleTimeString()}`;
});

window.addEventListener("message", (event) => {
  if (event.data?.type !== "sovereign:route") {
    return;
  }

  renderRoute(event.data.path || "/");
});

function navigate(path) {
  renderRoute(path);
  window.parent.postMessage(
    {
      type: "sovereign:navigate",
      path,
    },
    "*"
  );
}

function renderRoute(path) {
  currentRoute = path;

  if (route) {
    route.textContent = currentRoute;
  }
}
