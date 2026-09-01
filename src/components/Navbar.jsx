import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";

function Navbar() {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <nav className={`nav${isMenuOpen ? " menu-open" : ""}`}>
      <Link className="nav-logo" to="/" onClick={closeMenu} aria-label="NextGenies home">
        <img src={logo} alt="NextGenies Logo" />
      </Link>

      <div className="nav-links" id="primary-navigation">
        <Link
          className={location.pathname === "/" ? "active" : ""}
          to="/"
          onClick={closeMenu}
        >
          Home
        </Link>

        <Link
          className={location.pathname === "/services" ? "active" : ""}
          to="/services"
          onClick={closeMenu}
        >
          Services
        </Link>

        <Link
          className={location.pathname === "/about" ? "active" : ""}
          to="/about"
          onClick={closeMenu}
        >
          About
        </Link>

        <Link
          className={location.pathname === "/contact" ? "active" : ""}
          to="/contact"
          onClick={closeMenu}
        >
          Contact
        </Link>
      </div>

      <Link className="nav-cta" to="/contact" onClick={closeMenu}>
        Get Started
      </Link>

      <button
        className="nav-menu-toggle"
        type="button"
        aria-expanded={isMenuOpen}
        aria-controls="primary-navigation"
        aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
      >
        <span />
        <span />
      </button>
    </nav>
  );
}

export default Navbar;