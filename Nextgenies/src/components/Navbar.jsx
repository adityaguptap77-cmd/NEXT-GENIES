import { Link, useLocation } from "react-router-dom";

function Navbar() {
  const location = useLocation();

  return (
    <nav className="nav">
      <div className="nav-logo">NextGenies</div>

      <div className="nav-links">
        <Link
          className={location.pathname === "/" ? "active" : ""}
          to="/"
        >
          Home
        </Link>

        <Link
          className={location.pathname === "/services" ? "active" : ""}
          to="/services"
        >
          Services
        </Link>

        <Link
          className={location.pathname === "/about" ? "active" : ""}
          to="/about"
        >
          About
        </Link>

        <Link
          className={location.pathname === "/contact" ? "active" : ""}
          to="/contact"
        >
          Contact
        </Link>
      </div>

      <Link to="/contact">
        <button className="nav-cta">
          Get Started
        </button>
      </Link>
    </nav>
  );
}

export default Navbar;