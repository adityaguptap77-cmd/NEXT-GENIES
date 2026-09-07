import { Link, useLocation } from "react-router-dom";

function Breadcrumbs() {
  const { pathname } = useLocation();
  const crumbs = pathname.split("/").filter(Boolean);
  const pathAccum = [];
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="breadcrumb" className="breadcrumbs">
      <ol>
        <li><Link to="/">Home</Link></li>
        {crumbs.map((c, i) => {
          pathAccum.push(c);
          const to = "/" + pathAccum.join("/");
          const name = c.charAt(0).toUpperCase() + c.slice(1);
          const isCurrent = i === crumbs.length - 1;
          return (
            <li key={i}>
              {isCurrent ? (
                <span aria-current="page">{name}</span>
              ) : (
                <Link to={to}>{name}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;

