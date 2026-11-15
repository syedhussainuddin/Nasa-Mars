import Icon from "./Icon.jsx";

export default function RightToolbar({ view, panel, hazardsVisible, dispatch }) {
  const tools = [
    {
      icon: "pin", label: "Route planner", active: panel === "planner",
      title: view === "map" ? "Locate Jezero study area and open route planner" : "Route planner",
      controls: "planner-panel", action: view === "map"
        ? { type: "LOCATE_STUDY_AREA" } : { type: "TOGGLE_PANEL", panel: "planner" },
    },
    {
      icon: "star", label: "Saved routes", active: panel === "saved",
      controls: "saved-panel", action: { type: "TOGGLE_PANEL", panel: "saved" },
    },
    {
      icon: "map", label: view === "globe" ? "Switch to 2D map" : "Toggle hazard overlay",
      title: view === "map" ? "Toggle hazards — coverage is limited to Jezero" : "Switch to 2D map",
      active: view === "map" && hazardsVisible, action: { type: "MAP_TOOL" },
    },
  ].filter((tool) => view === "map" || tool.icon !== "map");
  return (
    <nav className="right-toolbar" aria-label="Navigation tools">
      {tools.map((tool) => (
        <button key={tool.icon} className="tool-button" type="button" aria-label={tool.label}
          title={tool.title || tool.label} aria-pressed={tool.active}
          aria-controls={tool.controls}
          aria-expanded={tool.controls ? tool.active : undefined}
          onClick={() => dispatch(tool.action)}>
          <Icon name={tool.icon} />
        </button>
      ))}
    </nav>
  );
}
