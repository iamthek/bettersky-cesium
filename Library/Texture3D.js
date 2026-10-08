import { 
    Cartesian3,
    createGuid,
    defined,
    destroyObject,
    DeveloperError,
    PixelFormat,
    WebGLConstants,
    MipmapHint,
    PixelDatatype,
    Sampler
 } from "cesium";
import * as Cesium from "cesium";
const defaultValue = (a, b) => a ?? b;
defaultValue.EMPTY_OBJECT = Object.freeze({});

/**
 * @description WebGL 3D 纹理，用于体积数据采样。
 * @returns Object
 */
export default class Texture3D {

    constructor(options = {}) {
        const context = options.context;
        const width = options.width;
        const height = options.height;
        const depth = options.depth;
        const source = options.source;
        const useTexStorage = defaultValue(options.useTexStorage, false);
        const preMultiplyAlpha = defaultValue(options.preMultiplyAlpha, false);
        const flipY = defaultValue(options.flipY, false);
        const levels = defaultValue(options.levels, 1);
        const unpackAlignment = defaultValue(options.unpackAlignment, 4);
        const pixelFormat = defaultValue(options.pixelFormat, PixelFormat.RGBA);
        let pixelDatatype = defaultValue(options.pixelDatatype, PixelDatatype.UNSIGNED_BYTE);
        let glInternalFormat = pixelFormat;
        if (pixelDatatype === PixelDatatype.FLOAT) {
            switch (pixelFormat) {
                case PixelFormat.RGBA:
                    glInternalFormat = WebGLConstants.RGBA32F;
                    break;
                case PixelFormat.RGB:
                    glInternalFormat = WebGLConstants.R11F_G11F_B10F;
                    break;
                case PixelFormat.RG:
                    glInternalFormat = WebGLConstants.RG32F;
                    break;
                case PixelFormat.RED:
                    glInternalFormat = WebGLConstants.R32F;
                    break;
                case PixelFormat.R11F_G11F_B10F:
                    glInternalFormat = WebGLConstants.R11F_G11F_B10F;
                    break;
            }
        } else if (pixelDatatype === PixelDatatype.HALF_FLOAT) {
            pixelDatatype = PixelDatatype.FLOAT
            switch (pixelFormat) {
                case PixelFormat.RGBA:
                    glInternalFormat = WebGLConstants.RGBA16F;
                    break;
                case PixelFormat.RGB:
                    glInternalFormat = WebGLConstants.RGB16F;
                    break;
                case PixelFormat.RG:
                    glInternalFormat = WebGLConstants.RG16F;
                    break;
                case PixelFormat.RED:
                    glInternalFormat = WebGLConstants.R16F
            }
        } else if (pixelDatatype === PixelDatatype.UNSIGNED_BYTE) {
            switch (pixelFormat) {
                case PixelFormat.RED:
                    glInternalFormat = WebGLConstants.R8;
                    break;
                case PixelFormat.RG:
                    glInternalFormat = WebGLConstants.RG8;
                    break;
                case PixelFormat.RGBA:
                    glInternalFormat = WebGLConstants.RGBA8;
                    break;
            }
        } else if (pixelDatatype === PixelDatatype.UNSIGNED_SHORT) {
            switch (pixelFormat) {
                case PixelFormat.RED_INTEGER:
                    glInternalFormat = WebGLConstants.R16UI;
                    break;
                case PixelFormat.RG_INTEGER:
                    glInternalFormat = WebGLConstants.RG16UI;
                    break;
                case PixelFormat.RGB_INTEGER:
                    glInternalFormat = WebGLConstants.RGB16UI;
                    break;
                case PixelFormat.RGBA_INTEGER:
                    glInternalFormat = WebGLConstants.RGBA16UI;
                    break;
            }
        }
        let _initialized = true;
        const _gl = context._gl;
        const textureType = defaultValue(options.textureType, _gl.TEXTURE_3D); // TEXTURE_2D_ARRAY
        const texture = _gl.createTexture();
        _gl.activeTexture(_gl.TEXTURE0);
        _gl.bindTexture(textureType, texture)
        if (defined(source)) {

            if (defined(source.arrayBufferView)) {
                let arrayBufferView = source.arrayBufferView;

                _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, false);

                if (flipY) {
                    arrayBufferView = PixelFormat.flipY(
                        arrayBufferView,
                        pixelFormat,
                        pixelDatatype,
                        width,
                        height
                    );
                }

                _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, unpackAlignment);

                if (useTexStorage) {

                    _gl.texStorage3D(textureType, levels, glInternalFormat, width, height, depth);

                    _gl.texSubImage3D(textureType, 0, 0, 0, 0, width, height, depth, pixelFormat, pixelDatatype, arrayBufferView);
                } else {

                    _gl.texImage3D(textureType, 0, glInternalFormat, width, height, depth, 0, pixelFormat, pixelDatatype, arrayBufferView)
                }

            } else if (defined(source.framebuffer)) {

                if (source.framebuffer !== context.defaultFramebuffer) {
                    source.framebuffer._bind()
                }

                _gl.copyTexImage2D(textureType, 0, glInternalFormat, source.xOffset, source.yOffset, width, height, 0)

                if (source.framebuffer !== context.defaultFramebuffer) {
                    source.framebuffer._unBind()
                }

            } else {

                _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, preMultiplyAlpha)

                _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, flipY)

                _gl.texImage3D(textureType, 0, glInternalFormat, width, height, depth, 0, pixelFormat, pixelDatatype, source.width ? source.data : source);
            }
        } else {
            _gl.texImage3D(textureType, 0, glInternalFormat, width, height, depth, 0, pixelFormat, pixelDatatype, null)
            _initialized = false;
        }
        _gl.bindTexture(textureType, null)
        this._id = createGuid();
        this._context = context;
        this._sizeInBytes = texture3DSizeInBytes(pixelFormat, pixelDatatype, width, height, depth);
        this._textureFilterAnisotropic = context._textureFilterAnisotropic;
        this._textureTarget = textureType;
        this._texture = texture;
        this._pixelFormat = pixelFormat;
        this._pixelDatatype = pixelDatatype;
        this._internalFormat = glInternalFormat;
        this._width = width;
        this._height = height;
        this._depth = depth;
        this._dimensions = new Cartesian3(width, height, depth);
        this._hasMipmap = false;
        this._flipY = flipY;
        this._levels = levels;
        this._preMultiplyAlpha = preMultiplyAlpha;
        this._initialized = _initialized
        this._sampler = undefined
        this.sampler = defined(options.sampler) ? options.sampler : new Sampler;
    }
}

function texture3DSizeInBytes(pixelFormat, pixelDatatype, width, height, depth) {
    return width * height * depth *
        PixelFormat.componentsLength(pixelFormat) * PixelDatatype.sizeInBytes(pixelDatatype);
}

Texture3D.create = function (options) {

    return new Texture3D(options);
}

Object.defineProperties(Texture3D.prototype, {
    id: {
        get: function () {
            return this._id
        }
    },
    sampler: {
        get: function () {
            return this._sampler
        },
        set: function (sampler) {
            const minificationFilter = sampler.minificationFilter;
            const magnificationFilter = sampler.magnificationFilter;
            const _gl = this._context._gl;
            const textureTarget = this._textureTarget;
            _gl.activeTexture(_gl.TEXTURE0)
            _gl.bindTexture(textureTarget, this._texture)
            _gl.texParameteri(textureTarget, _gl.TEXTURE_MIN_FILTER, minificationFilter)
            _gl.texParameteri(textureTarget, _gl.TEXTURE_MAG_FILTER, magnificationFilter)
            _gl.texParameteri(textureTarget, _gl.TEXTURE_WRAP_S, sampler.wrapS)
            _gl.texParameteri(textureTarget, _gl.TEXTURE_WRAP_T, sampler.wrapT)
            _gl.texParameteri(textureTarget, _gl.TEXTURE_WRAP_R, sampler.wrapR)
            if (defined(this._textureFilterAnisotropic)) {
                _gl.texParameteri(textureTarget, this._textureFilterAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT,
                    sampler.maximumAnisotropy)
            }
            _gl.bindTexture(textureTarget, null)
            this._sampler = sampler
        }
    },
    pixelFormat: {
        get: function () {
            return this._pixelFormat
        }
    },
    pixelDatatype: {
        get: function () {
            return this._pixelDatatype
        }
    },
    dimensions: {
        get: function () {
            return this._dimensions
        }
    },
    width: {
        get: function () {
            return this._width
        }
    },
    height: {
        get: function () {
            return this._height
        }
    },
    depth: {
        get: function () {
            return this._depth
        }
    },
    sizeInBytes: {
        get: function () {
            return this._hasMipmap ? Math.floor(4 * this._sizeInBytes / 3) : this._sizeInBytes;
        }
    },
    _target: {
        get: function () {
            return this._textureTarget
        }
    }
})
Texture3D.prototype.isDestroyed = function () {
    return false;
}

Texture3D.prototype.destroy = function () {

    this._context._gl.deleteTexture(this._texture)

    return destroyObject(this);

}
Texture3D.prototype.fromFramebuffer = function (options = {}) {
    const context = options.context;
    const _gl = context._gl;
    const pixelFormat = defaultValue(options.pixelFormat, PixelFormat.RGB);
    const xOffset = defaultValue(options.xOffset, 0);
    const yOffset = defaultValue(options.yOffset, 0);
    const width = defaultValue(options.width, _gl.drawingBufferWidth);
    const height = defaultValue(options.height, _gl.drawingBufferHeight);
    const depth = defaultValue(options.depth, 128);
    const framebuffer = options.framebuffer;

    const texture = new Texture3D({
        context: context,
        width: width,
        height: height,
        pixelFormat: pixelFormat,
        source: {
            framebuffer: defined(framebuffer) ? framebuffer : context.defaultFramebuffer,
            xOffset: xOffset,
            yOffset: yOffset,
            width: width,
            height: height,
            depth: depth,
        }
    });
    return texture;
};

Texture3D.prototype.generateMipmap = function (hint) {
    hint = defaultValue(hint, MipmapHint.DONT_CARE);
    this._hasMipmap = true;
    const _gl = this._context._gl
    const textureTarget = this._textureTarget;
    _gl.hint(_gl.GENERATE_MIPMAP_HINT, hint)
    _gl.activeTexture(_gl.TEXTURE0)
    _gl.bindTexture(textureTarget, this._texture)
    _gl.generateMipmap(textureTarget)
    _gl.bindTexture(textureTarget, null)
};

Texture3D.prototype.copyFrom = function (options) {
    const xOffset = defaultValue(options.xOffset, 0);
    const yOffset = defaultValue(options.yOffset, 0);

    if (PixelFormat.isDepthFormat(this._pixelFormat)) {
        throw new DeveloperError(
            "Cannot call copyFrom when the texture pixel format is DEPTH_COMPONENT or DEPTH_STENCIL."
        );
    }
    if (PixelFormat.isCompressedFormat(this._pixelFormat)) {
        throw new DeveloperError(
            "Cannot call copyFrom with a compressed texture pixel format."
        );
    }

    const source = options.source;

    const context = this._context;
    const _gl = context._gl;
    const target = this._textureTarget;

    _gl.activeTexture(_gl.TEXTURE0);
    _gl.bindTexture(target, this._texture);

    const width = defaultValue(source.width, this._width);
    const height = defaultValue(source.height, this._height);
    const depth = defaultValue(source.depth, this._depth);
    let arrayBufferView = source.arrayBufferView;

    const textureWidth = this._width;
    const textureHeight = this._height;
    const textureDepth = this._depth;
    const internalFormat = this._internalFormat;
    const pixelFormat = this._pixelFormat;
    const pixelDatatype = this._pixelDatatype;
    const levels = defaultValue(options.levels, this._levels);

    const preMultiplyAlpha = this._preMultiplyAlpha;
    const flipY = this._flipY;
    const skipColorSpaceConversion = defaultValue(
        options.skipColorSpaceConversion,
        false
    );

    let unpackAlignment = 4;
    if (defined(arrayBufferView)) {
        unpackAlignment = PixelFormat.alignmentInBytes(
            pixelFormat,
            pixelDatatype,
            width
        );
    }

    _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, unpackAlignment);

    if (skipColorSpaceConversion) {
        _gl.pixelStorei(_gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, _gl.NONE);
    } else {
        _gl.pixelStorei(
            _gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
            _gl.BROWSER_DEFAULT_WEBGL
        );
    }

    let uploaded = false;
    if (!this._initialized) {
        if (
            xOffset === 0 &&
            yOffset === 0 &&
            width === textureWidth &&
            height === textureHeight &&
            depth === textureDepth
        ) {
            // initialize the entire texture
            if (defined(arrayBufferView)) {
                _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, false);

                if (flipY) {
                    arrayBufferView = PixelFormat.flipY(
                        arrayBufferView,
                        pixelFormat,
                        pixelDatatype,
                        textureWidth,
                        textureHeight
                    );
                }

                _gl.texImage3D(target, 0, internalFormat,
                    textureWidth, textureHeight, textureDepth, 0,
                    pixelFormat, PixelDatatype.toWebGLConstant(pixelDatatype, context), arrayBufferView);
            } else {
                // Only valid for DOM-Element uploads
                _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, preMultiplyAlpha);
                _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, flipY);

                _gl.texImage3D(target, 0, internalFormat,
                    textureWidth, textureHeight, textureDepth, 0,
                    pixelFormat, PixelDatatype.toWebGLConstant(pixelDatatype, context), source);
            }
            uploaded = true;
        } else {
            _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, false);

            // initialize the entire texture to zero
            const bufferView = PixelFormat.createTypedArray(
                pixelFormat,
                pixelDatatype,
                textureWidth,
                textureHeight
            );

            _gl.texImage3D(target, 0, internalFormat,
                textureWidth, textureHeight, textureDepth, 0,
                pixelFormat, PixelDatatype.toWebGLConstant(pixelDatatype, context), bufferView);
        }
        this._initialized = true;
    }

    if (!uploaded) {
        if (defined(arrayBufferView)) {
            _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, false);

            if (flipY) {
                arrayBufferView = PixelFormat.flipY(
                    arrayBufferView,
                    pixelFormat,
                    pixelDatatype,
                    width,
                    height
                );
            }

            _gl.texStorage3D(target, levels, this._internalFormat, width, height, depth);
            _gl.texSubImage3D(target, 0, 0, 0, 0, width, height, depth, pixelFormat,
                PixelDatatype.toWebGLConstant(pixelDatatype, context), arrayBufferView);
        } else {
            // Only valid for DOM-Element uploads
            _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, preMultiplyAlpha);
            _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, flipY);

            _gl.texSubImage3D(target, 0, 0, 0, 0, width, height, depth, pixelFormat,
                PixelDatatype.toWebGLConstant(pixelDatatype, context), source);
        }
    }

    _gl.bindTexture(target, null);
};