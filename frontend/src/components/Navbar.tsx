import { useState, useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X, ChevronDown } from 'lucide-react'
import LogoImg from '../../images/logo.png'
import { NAV_LINKS } from '../constants'
import { classNames } from '../utils'

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  // Detect scrolling
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30)
    }

    window.addEventListener('scroll', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Close mobile menu when changing page
  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  return (
    <nav className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-[1600px]">

      {/* FLOATING NAVBAR */}
      <div
        className={classNames(
          'w-full rounded-[24px] border transition-all duration-500',
          'bg-white/95 backdrop-blur-md',
          scrolled
            ? 'border-primary-200 shadow-2xl'
            : 'border-white shadow-[0_10px_30px_rgba(255,255,255,0.85)]'
        )}
      >

        {/* MAIN NAVBAR ROW */}
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-[74px] lg:min-h-[86px]">

            {/* =========================================
                LOGO
            ========================================= */}
            <Link
              to="/"
              className="flex items-center gap-3 shrink-0 group"
            >

              {/* LOGO IMAGE */}
              <img
                src={LogoImg}
                alt="Waka Coffee Export PLC"
                className="h-12 sm:h-14 lg:h-16 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
              />


              <div className="hidden xl:block leading-tight">
                <span className="block text-lg font-bold text-coffee-950">
                  WAKA
                </span>

                <span className="block text-[9px] tracking-[0.2em] uppercase text-primary-600 font-semibold">
                 Coffee Export PLC
                </span>
              </div>

            </Link>


            {/* =========================================
                DESKTOP NAVIGATION
            ========================================= */}
            <div className="hidden lg:flex items-center justify-center flex-1 mx-5 xl:mx-8">

              <div className="flex items-center gap-0.5 xl:gap-1">

                {/* HOME / FIRST LINKS */}
                {NAV_LINKS.slice(0, 4).map((link) => (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    end={link.path === '/'}
                    className={({ isActive }) =>
                      classNames(
                        'relative px-3 xl:px-4 py-3',
                        'text-sm xl:text-[15px]',
                        'font-medium',
                        'whitespace-nowrap',
                        'transition-colors duration-200',

                        isActive
                          ? 'text-primary-700'
                          : 'text-coffee-900 hover:text-primary-600'
                      )
                    }
                  >
                    {link.name}
                  </NavLink>
                ))}


                {/* =====================================
                    MORE DROPDOWN
                ===================================== */}
                {NAV_LINKS.length > 4 && (
                  <div className="relative group">

                    <button
                      type="button"
                      className="
                        flex
                        items-center
                        gap-1
                        px-3
                        xl:px-4
                        py-3
                        text-sm
                        xl:text-[15px]
                        font-medium
                        text-coffee-900
                        hover:text-primary-600
                        transition-colors
                        duration-200
                        whitespace-nowrap
                      "
                    >
                      More

                      <ChevronDown
                        className="
                          w-4
                          h-4
                          transition-transform
                          duration-300
                          group-hover:rotate-180
                        "
                      />
                    </button>


                    {/* DROPDOWN */}
                    <div
                      className="
                        absolute
                        right-0
                        top-full
                        pt-3
                        w-56
                        opacity-0
                        invisible
                        translate-y-2
                        group-hover:opacity-100
                        group-hover:visible
                        group-hover:translate-y-0
                        transition-all
                        duration-200
                      "
                    >

                      <div
                        className="
                          bg-white
                          rounded-2xl
                          border
                          border-coffee-100
                          shadow-2xl
                          p-2
                          overflow-hidden
                        "
                      >

                        {NAV_LINKS.slice(4).map((link) => (
                          <NavLink
                            key={link.path}
                            to={link.path}
                            className={({ isActive }) =>
                              classNames(
                                'block px-4 py-3 rounded-xl',
                                'text-sm',
                                'transition-colors duration-200',

                                isActive
                                  ? 'bg-primary-50 text-primary-700 font-medium'
                                  : 'text-coffee-800 hover:bg-primary-50 hover:text-primary-600'
                              )
                            }
                          >
                            {link.name}
                          </NavLink>
                        ))}

                      </div>

                    </div>

                  </div>
                )}

              </div>

            </div>


            {/* =========================================
                RIGHT SIDE BUTTONS
            ========================================= */}
            <div className="hidden lg:flex items-center gap-2 xl:gap-3 shrink-0">

              {/* REQUEST SAMPLE */}
              <Link
                to="/request-sample"
                className="
                  px-3
                  xl:px-4
                  py-2.5
                  text-sm
                  font-medium
                  text-coffee-900
                  hover:text-primary-600
                  transition-colors
                  duration-200
                  whitespace-nowrap
                "
              >
                Request Sample
              </Link>


              {/* REQUEST QUOTE */}
              <Link
                to="/request-quote"
                className="
                  px-4
                  xl:px-5
                  py-3
                  rounded-xl
                  bg-primary-600
                  hover:bg-primary-700
                  text-white
                  text-sm
                  font-semibold
                  shadow-lg
                  shadow-primary-600/20
                  hover:shadow-xl
                  transition-all
                  duration-200
                  hover:-translate-y-0.5
                  whitespace-nowrap
                "
              >
                Request Quote
              </Link>

            </div>


            {/* =========================================
                MOBILE MENU BUTTON
            ========================================= */}
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="
                lg:hidden
                p-3
                rounded-xl
                text-coffee-900
                hover:bg-primary-50
                hover:text-primary-700
                transition-colors
                duration-200
              "
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isOpen}
            >

              {isOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}

            </button>

          </div>
        </div>


        {/* =============================================
            MOBILE MENU
        ============================================= */}
        <div
          className={classNames(
            'lg:hidden overflow-hidden transition-all duration-300 ease-out',
            isOpen
              ? 'max-h-[80vh] opacity-100'
              : 'max-h-0 opacity-0'
          )}
        >

          <div className="border-t border-coffee-100 px-5 py-4">

            {/* MOBILE NAV LINKS */}
            <div className="space-y-1">

              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  end={link.path === '/'}
                  className={({ isActive }) =>
                    classNames(
                      'block px-4 py-3 rounded-xl',
                      'font-medium',
                      'transition-colors duration-200',

                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-coffee-900 hover:bg-primary-50 hover:text-primary-600'
                    )
                  }
                >
                  {link.name}
                </NavLink>
              ))}

            </div>


            {/* MOBILE ACTION BUTTONS */}
            <div className="pt-4 mt-4 border-t border-coffee-100 space-y-2">

              <Link
                to="/request-sample"
                className="
                  block
                  w-full
                  text-center
                  px-4
                  py-3
                  rounded-xl
                  font-semibold
                  text-coffee-900
                  bg-coffee-100
                  hover:bg-coffee-200
                  transition-colors
                "
              >
                Request Sample
              </Link>


              <Link
                to="/request-quote"
                className="
                  block
                  w-full
                  text-center
                  px-4
                  py-3
                  rounded-xl
                  font-semibold
                  text-white
                  bg-primary-600
                  hover:bg-primary-700
                  transition-colors
                  shadow-lg
                "
              >
                Request Quote
              </Link>

            </div>

          </div>

        </div>

      </div>
    </nav>
  )
}

export default Navbar