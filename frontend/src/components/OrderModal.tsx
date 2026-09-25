import { X, Package, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface OrderModalProps {
  isOpen: boolean
  onClose: () => void
  productName: string
}

export default function OrderModal({ isOpen, onClose, productName }: OrderModalProps) {
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleSelect = (path: string) => {
    onClose()
    const target = `${path}?product=${encodeURIComponent(productName)}`
    navigate(target)
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-2xl border border-gray-100 transform transition-all animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full uppercase tracking-wider mb-2">
            Order Placement
          </span>
          <h3 className="text-2xl font-bold text-gray-900 font-serif">
            {productName || 'Ethiopian Coffee'}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Select how you would like to proceed with your order:
          </p>
        </div>

        {/* Order Options */}
        <div className="space-y-4">
          {/* Request Sample */}
          <button
            type="button"
            onClick={() => handleSelect('/request-sample')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100/80 hover:border-emerald-500 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 group-hover:text-emerald-900 transition-colors">
                Request Sample
              </h4>
              <p className="text-xs text-gray-600 mt-0.5">
                Order a sample batch to evaluate coffee quality before placing a commercial order.
              </p>
            </div>
          </button>

          {/* Request Quote */}
          <button
            type="button"
            onClick={() => handleSelect('/request-quote')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-100 bg-amber-50/50 hover:bg-amber-100/80 hover:border-amber-500 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-700 text-white flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 group-hover:text-amber-900 transition-colors">
                Request Quote
              </h4>
              <p className="text-xs text-gray-600 mt-0.5">
                Get a competitive commercial export quotation for bulk orders and container shipments.
              </p>
            </div>
          </button>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-700 underline font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
